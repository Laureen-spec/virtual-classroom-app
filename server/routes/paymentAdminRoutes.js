import express from "express";
import PaymentRecord from "../models/PaymentRecord.js";
import Subscription from "../models/Subscription.js";
import { verifyToken, roleCheck } from "../middleware/authMiddleware.js";

const router = express.Router();

// Admin can see all payment records with subscription details
router.get("/", verifyToken, roleCheck(["admin"]), async (req, res) => {
  try {
    const payments = await PaymentRecord.find()
      .populate("student", "name email")
      .populate("subscription")
      .sort({ createdAt: -1 });
    
    res.json(payments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch payment records" });
  }
});

// Get payment statistics for admin dashboard
router.get("/stats", verifyToken, roleCheck(["admin"]), async (req, res) => {
  try {
    const totalRevenue = await PaymentRecord.aggregate([
      { $match: { status: "success" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const weeklyRevenue = await PaymentRecord.aggregate([
      { 
        $match: { 
          status: "success",
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        } 
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const totalPayments = await PaymentRecord.countDocuments({ status: "success" });
    const pendingPayments = await PaymentRecord.countDocuments({ status: "pending" });

    res.json({
      totalRevenue: totalRevenue[0]?.total || 0,
      weeklyRevenue: weeklyRevenue[0]?.total || 0,
      totalPayments,
      pendingPayments
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch payment stats" });
  }
});

export default router;