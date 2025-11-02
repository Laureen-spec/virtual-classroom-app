import express from "express";
import ClassSchedule from "../models/ClassSchedule.js";
import LiveSession from "../models/LiveSession.js";
import { verifyToken, roleCheck } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ===================================================
   🟢 CREATE CLASS (Teacher Only)
=================================================== */
router.post("/create", verifyToken, roleCheck(["teacher"]), async (req, res) => {
  try {
    const { title, description, startTime, endTime, meetingLink } = req.body;

    if (!title || !startTime || !endTime) {
      return res.status(400).json({ message: "Title, start and end times are required" });
    }

    const newClass = new ClassSchedule({
      title,
      description,
      teacher: req.user.id,
      startTime,
      endTime,
      meetingLink,
    });

    await newClass.save();
    res.status(201).json({
      message: "✅ Class scheduled successfully",
      class: newClass,
    });
  } catch (error) {
    console.error("❌ Error creating class:", error);
    res.status(500).json({ message: "Failed to schedule class" });
  }
});

/* ===================================================
   📅 GET UPCOMING CLASSES (All Users + Admin)
=================================================== */
router.get("/upcoming", verifyToken, async (req, res) => {
  try {
    const now = new Date();
    let query = { startTime: { $gt: now } };
    
    // If user is teacher, only show their classes. Admin sees all.
    if (req.user.role === "teacher") {
      query.teacher = req.user.id;
    }
    // Admin and students see all classes (no teacher filter)

    const classes = await ClassSchedule.find(query)
      .populate("teacher", "name email")
      .sort({ startTime: 1 }); // Sort by upcoming first

    res.json(classes);
  } catch (error) {
    console.error("❌ Error fetching upcoming classes:", error);
    res.status(500).json({ message: "Failed to fetch upcoming classes" });
  }
});

/* ===================================================
   🕒 GET ONGOING CLASSES (All Users + Admin)
=================================================== */
router.get("/ongoing", verifyToken, async (req, res) => {
  try {
    const now = new Date();
    let query = {
      startTime: { $lte: now },
      endTime: { $gte: now },
    };
    
    // If user is teacher, only show their classes. Admin sees all.
    if (req.user.role === "teacher") {
      query.teacher = req.user.id;
    }
    // Admin and students see all classes (no teacher filter)

    const classes = await ClassSchedule.find(query)
      .populate("teacher", "name email")
      .sort({ startTime: 1 });

    res.json(classes);
  } catch (error) {
    console.error("❌ Error fetching ongoing classes:", error);
    res.status(500).json({ message: "Failed to fetch ongoing classes" });
  }
});

/* ===================================================
   🕓 GET PAST CLASSES (All Users + Admin)
=================================================== */
router.get("/past", verifyToken, async (req, res) => {
  try {
    const now = new Date();
    let query = { endTime: { $lt: now } };
    
    // If user is teacher, only show their classes. Admin sees all.
    if (req.user.role === "teacher") {
      query.teacher = req.user.id;
    }
    // Admin and students see all classes (no teacher filter)

    const classes = await ClassSchedule.find(query)
      .populate("teacher", "name email")
      .sort({ endTime: -1 }); // Sort by most recent first

    res.json(classes);
  } catch (error) {
    console.error("❌ Error fetching past classes:", error);
    res.status(500).json({ message: "Failed to fetch past classes" });
  }
});

/* ===================================================
   🔴 GET ACTIVE LIVE SESSIONS (All Authenticated Users)
=================================================== */
router.get("/active-live", verifyToken, async (req, res) => {
  try {
    const activeSessions = await LiveSession.find({ isActive: true })
      .populate("teacherId", "name email")
      .populate("classId", "title")
      .select("sessionTitle startTime participants channelName classId teacherId")
      .sort({ startTime: -1 });

    const sessionsWithCount = activeSessions.map(session => ({
      _id: session._id,
      sessionTitle: session.sessionTitle,
      teacherName: session.teacherId.name,
      teacherEmail: session.teacherId.email,
      className: session.classId.title,
      classId: session.classId._id,
      startTime: session.startTime,
      participantCount: session.participants.length,
      channelName: session.channelName
    }));

    res.json(sessionsWithCount);
  } catch (error) {
    console.error("❌ Error fetching active live sessions:", error);
    res.status(500).json({ message: "Failed to fetch active live sessions" });
  }
});

/* ===================================================
   ✏️ UPDATE CLASS (Teacher Only - Own Classes)
=================================================== */
router.put("/:id", verifyToken, roleCheck(["teacher"]), async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await ClassSchedule.findOneAndUpdate(
      { _id: id, teacher: req.user.id }, // teacher can only update their own class
      req.body,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Class not found or unauthorized" });
    }

    res.json({
      message: "✅ Class updated successfully",
      updated,
    });
  } catch (error) {
    console.error("❌ Error updating class:", error);
    res.status(500).json({ message: "Failed to update class" });
  }
});

/* ===================================================
   🗑️ DELETE CLASS (Teacher Only - Own Classes)
=================================================== */
router.delete("/:id", verifyToken, roleCheck(["teacher"]), async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await ClassSchedule.findOneAndDelete({
      _id: id,
      teacher: req.user.id, // teacher can only delete their own classes
    });

    if (!deleted) {
      return res.status(404).json({ message: "Class not found or unauthorized" });
    }

    res.json({ message: "🗑️ Class deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting class:", error);
    res.status(500).json({ message: "Failed to delete class" });
  }
});

/* ===================================================
   👑 ADMIN: GET ALL CLASSES (Admin Only)
=================================================== */
router.get("/admin/all-classes", verifyToken, roleCheck(["admin"]), async (req, res) => {
  try {
    const classes = await ClassSchedule.find()
      .populate("teacher", "name email")
      .sort({ startTime: -1 });

    res.json(classes);
  } catch (error) {
    console.error("❌ Error fetching all classes for admin:", error);
    res.status(500).json({ message: "Failed to fetch classes" });
  }
});

export default router;