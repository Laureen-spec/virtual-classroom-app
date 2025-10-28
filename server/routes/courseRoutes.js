import express from "express";
import { verifyToken, roleCheck } from "../middleware/authMiddleware.js";

import Course from "../models/Course.js";

const router = express.Router();

// 🔹 Create a new course (Teacher only)
router.post("/create", verifyToken, roleCheck(["teacher"]), async (req, res) => {
  try {
    const { title, description } = req.body;
    const teacherId = req.user.id;

    const newCourse = new Course({ title, description, teacher: teacherId });
    await newCourse.save();

    res.status(201).json({ message: "Course created successfully", course: newCourse });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 🔹 Get all courses by the logged-in teacher
router.get("/my-courses", verifyToken, roleCheck(["teacher"]), async (req, res) => {
  try {
    const teacherId = req.user.id;
    const courses = await Course.find({ teacher: teacherId });
    res.json(courses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 🔹 Delete a course
router.delete("/:id", verifyToken, roleCheck(["teacher"]), async (req, res) => {
  try {
    const course = await Course.findOneAndDelete({ _id: req.params.id, teacher: req.user.id });
    if (!course) return res.status(404).json({ message: "Course not found or not yours" });
    res.json({ message: "Course deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
