import express from "express";
import { verifyToken, roleCheck } from "../middleware/authMiddleware.js";
import Assignment from "../models/Assignment.js";
import { upload } from "../utils/multerConfig.js";

const router = express.Router();

/* ===================================================
   🧑‍🎓 STUDENT — Submit Assignment
=================================================== */
router.post(
  "/submit",
  verifyToken,
  roleCheck(["student"]),
  upload.single("file"),
  async (req, res) => {
    try {
      const file = req.file;
      const { subject, title, teacherName, classId } = req.body;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      if (!subject) {
        return res.status(400).json({ message: "Subject is required" });
      }

      if (!teacherName || !teacherName.trim()) {
        return res.status(400).json({ message: "Teacher name is required" });
      }

      // ✅ Build assignment data
      const assignmentData = {
        student: req.user.id,
        subject,
        teacherName: teacherName.trim(),
        title: title || file.originalname,
        fileUrl: `/uploads/${file.filename}`,
        fileName: file.originalname,
        fileSize: file.size,
        contentType: file.mimetype,
        status: "submitted",
      };

      // Add classId if provided
      if (classId) {
        assignmentData.classId = classId;
      }

      const assignment = new Assignment(assignmentData);
      await assignment.save();

      res.status(201).json({ 
        message: "Assignment submitted successfully", 
        assignment 
      });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ message: "Upload failed" });
    }
  }
);

/* ===================================================
   🧑‍🏫 TEACHER — View All Submissions (Simple - no filtering)
=================================================== */
router.get(
  "/submissions",
  verifyToken,
  roleCheck(["teacher", "admin"]),
  async (req, res) => {
    try {
      console.log("Fetching all submissions for teacher/admin...");
      
      // Just get all submissions for now - teachers can see everything
      const subs = await Assignment.find({})
        .populate("student", "name email")
        .sort({ submittedAt: -1 });

      console.log(`Found ${subs.length} submissions`);
      res.json(subs);
    } catch (err) {
      console.error("Fetch error:", err);
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  }
);

/* ===================================================
   🧾 TEACHER — Mark as Received
=================================================== */
router.put(
  "/receive/:id",
  verifyToken,
  roleCheck(["teacher", "admin"]),
  async (req, res) => {
    try {
      const assignment = await Assignment.findByIdAndUpdate(
        req.params.id,
        { 
          status: "received", 
          receivedAt: new Date() 
        },
        { new: true }
      ).populate("student", "name email");

      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }

      res.json({ 
        message: "Marked as received", 
        assignment 
      });
    } catch (err) {
      console.error("Receive error:", err);
      res.status(500).json({ message: "Failed to update assignment" });
    }
  }
);

/* ===================================================
   🧑‍🏫 TEACHER — Grade Assignment
=================================================== */
router.put(
  "/grade/:id",
  verifyToken,
  roleCheck(["teacher", "admin"]),
  async (req, res) => {
    try {
      const { grade, feedback } = req.body;

      if (!grade) {
        return res.status(400).json({ message: "Grade is required" });
      }

      const assignment = await Assignment.findByIdAndUpdate(
        req.params.id,
        {
          status: "graded",
          grade: grade,
          feedback: feedback || "No feedback provided",
          gradedAt: new Date(),
        },
        { new: true }
      ).populate("student", "name email");

      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }

      res.json({ 
        message: "Assignment graded successfully", 
        assignment 
      });
    } catch (err) {
      console.error("Grade error:", err);
      res.status(500).json({ message: "Failed to grade assignment" });
    }
  }
);

/* ===================================================
   🧑‍🎓 STUDENT — View Their Assignments
=================================================== */
router.get(
  "/mine",
  verifyToken,
  roleCheck(["student"]),
  async (req, res) => {
    try {
      const list = await Assignment.find({ student: req.user.id })
        .sort({ submittedAt: -1 });
      res.json(list);
    } catch (err) {
      console.error("Fetch mine error:", err);
      res.status(500).json({ message: "Failed to fetch your assignments" });
    }
  }
);

/* ===================================================
   📊 GET Assignment by ID
=================================================== */
router.get(
  "/:id",
  verifyToken,
  async (req, res) => {
    try {
      const assignment = await Assignment.findById(req.params.id)
        .populate("student", "name email");

      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }

      res.json(assignment);
    } catch (err) {
      console.error("Fetch assignment error:", err);
      res.status(500).json({ message: "Failed to fetch assignment" });
    }
  }
);

export default router;