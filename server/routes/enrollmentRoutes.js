import express from "express";
import { verifyToken, roleCheck } from "../middleware/authMiddleware.js";
import Enrollment from "../models/Enrollment.js";
import Course from "../models/Course.js";

const router = express.Router();

// 🔹 Get all available courses (for students to browse)
router.get("/courses", verifyToken, roleCheck(["student"]), async (req, res) => {
  try {
    const courses = await Course.find().populate("teacher", "name email");
    res.json(courses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 🔹 Enroll in a course
router.post("/enroll/:courseId", verifyToken, roleCheck(["student"]), async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const studentId = req.user.id;

    // Check if already enrolled
    const existingEnrollment = await Enrollment.findOne({ student: studentId, course: courseId });
    if (existingEnrollment) {
      return res.status(400).json({ message: "Already enrolled in this course" });
    }

    const newEnrollment = new Enrollment({ student: studentId, course: courseId });
    await newEnrollment.save();

    res.status(201).json({ message: "Enrollment successful", enrollment: newEnrollment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 🔹 View enrolled courses
router.get("/my-enrollments", verifyToken, roleCheck(["student"]), async (req, res) => {
  try {
    const studentId = req.user.id;
    const enrollments = await Enrollment.find({ student: studentId }).populate("course");
    res.json(enrollments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
