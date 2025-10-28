import express from "express";
import { verifyToken, roleCheck } from "../middleware/authMiddleware.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Class from "../models/ClassSchedule.js"; // ✅ make sure you have this model


const router = express.Router();

// 🔹 Admin Dashboard Test Route
router.get("/dashboard", verifyToken, roleCheck(["admin"]), (req, res) => {
  res.json({ message: "Welcome to the Admin Dashboard!" });
});

// 🔹 Admin Reports Route (System Overview)
router.get("/reports", verifyToken, roleCheck(["admin"]), async (req, res) => {
  try {
    // Count total users by role
    const totalStudents = await User.countDocuments({ role: "student" });
    const totalTeachers = await User.countDocuments({ role: "teacher" });

    // Count classes and subscriptions
    const totalClasses = await Class.countDocuments();
    const totalSubscriptions = await Subscription.countDocuments();

    // Count active vs expired subscriptions
    const activeSubs = await Subscription.countDocuments({ status: "active" });
    const inactiveSubs = totalSubscriptions - activeSubs;

    // Aggregate total revenue (if your Subscription model stores payments)
    const totalRevenue = await Subscription.aggregate([
      { $group: { _id: null, total: { $sum: "$amountPaid" } } },
    ]);

    res.json({
      totalStudents,
      totalTeachers,
      totalClasses,
      totalSubscriptions,
      activeSubs,
      inactiveSubs,
      totalRevenue: totalRevenue[0]?.total || 0,
    });
  } catch (error) {
    console.error("Error generating reports:", error);
    res.status(500).json({ message: "Failed to load reports" });
  }
});

export default router;
