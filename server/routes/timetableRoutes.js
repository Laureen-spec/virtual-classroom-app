import express from "express";
import Timetable from "../models/Timetable.js";
import { verifyToken, roleCheck } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ===================================================
   🔹 CREATE A LESSON (Admin or Teacher)
=================================================== */
router.post("/create", verifyToken, roleCheck(["admin", "teacher"]), async (req, res) => {
  try {
    const { day, subject, startTime, endTime } = req.body;

    if (!day || !subject || !startTime || !endTime) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const lesson = new Timetable({
      day,
      subject,
      teacher: req.user.id,
      startTime,
      endTime,
      createdBy: req.user.id,
    });

    await lesson.save();
    res.status(201).json({ message: "✅ Lesson added successfully.", lesson });
  } catch (error) {
    console.error("Error creating lesson:", error);
    res.status(500).json({ message: "Server error while creating lesson." });
  }
});

/* ===================================================
   🔹 GET FULL TIMETABLE (Students, Teachers, Admins)
=================================================== */
router.get("/", verifyToken, async (req, res) => {
  try {
    const timetable = await Timetable.find()
      .populate("teacher", "name email role")
      .sort({ 
        day: 1,
        startTime: 1 
      });
    res.json(timetable);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch timetable." });
  }
});

/* ===================================================
   🔹 GET TIMETABLE BY DAY (Optional)
=================================================== */
router.get("/:day", verifyToken, async (req, res) => {
  try {
    const timetable = await Timetable.find({ day: req.params.day })
      .populate("teacher", "name email role")
      .sort({ startTime: 1 });
    res.json(timetable);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch timetable for this day." });
  }
});

/* ===================================================
   ✏️ UPDATE LESSON (Teacher/Admin Only)
=================================================== */
router.put("/:id", verifyToken, roleCheck(["admin", "teacher"]), async (req, res) => {
  try {
    const { day, subject, startTime, endTime } = req.body;
    const updated = await Timetable.findByIdAndUpdate(
      req.params.id,
      { day, subject, startTime, endTime },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Lesson not found." });
    res.json({ message: "✅ Lesson updated.", updated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update lesson." });
  }
});

/* ===================================================
   🗑️ DELETE LESSON (Admin/Teacher)
=================================================== */
router.delete("/:id", verifyToken, roleCheck(["admin", "teacher"]), async (req, res) => {
  try {
    const deleted = await Timetable.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Lesson not found." });
    res.json({ message: "🗑️ Lesson deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete lesson." });
  }
});

export default router;
