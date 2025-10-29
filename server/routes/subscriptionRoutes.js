import express from "express";
import Subscription from "../models/Subscription.js";
import { verifyToken, roleCheck } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ===================================================
   📋 GET SUBSCRIPTIONS (Admin & Student) - UPDATED
=================================================== */
router.get("/", verifyToken, roleCheck(["admin", "student"]), async (req, res) => {
  try {
    let subs;

    if (req.user.role === "admin") {
      // 👑 Admin sees all subscriptions
      subs = await Subscription.find()
        .populate("student", "name email")
        .sort({ createdAt: -1 });
    } else if (req.user.role === "student") {
      // 👨‍🎓 Student sees only their own subscriptions
      subs = await Subscription.find({ student: req.user.id })
        .populate("student", "name email")
        .sort({ createdAt: -1 });
    }

    res.status(200).json({
      message: "✅ Subscriptions fetched successfully",
      subscriptions: subs,
      count: subs.length
    });
  } catch (err) {
    res.status(500).json({ 
      message: "Failed to fetch subscriptions", 
      error: err.message 
    });
  }
});

/* ===================================================
   💳 CREATE SUBJECT-BASED SUBSCRIPTION (Student Only) - MODIFIED
=================================================== */
router.post("/create", verifyToken, roleCheck(["student"]), async (req, res) => {
  try {
    const { subjects, phone, transactionId } = req.body; // subjects now contains {subject, frequency}
    const studentId = req.user.id;
    const plan = "weekly"; // Fixed to weekly only

    // 🧠 Validate input
    if (!subjects || subjects.length === 0) {
      return res.status(400).json({ message: "Please select at least one subject." });
    }

    // Define fixed subject frequencies
    const fixedFrequencies = {
      "Mathematics": 5,
      "Chemistry": 4,
      "English": 4,
      "Kiswahili": 3,
      "Biology": 3,
      "Business": 3,
      "Agriculture": 3,
      "CRE": 3,
      "Physics": 2
    };

    // Validate each subject has the correct fixed frequency
    const invalidSubjects = subjects.filter(sub => {
      return !sub.frequency || sub.frequency !== fixedFrequencies[sub.subject];
    });

    if (invalidSubjects.length > 0) {
      return res.status(400).json({ 
        message: "Subject frequencies must match the fixed requirements." 
      });
    }

    // 💰 Calculate total amount and total lessons
    let total = 0;
    let totalLessons = 0;
    
    // Add creditsUsed field to each subject
    const subjectsWithCredits = subjects.map(subject => ({
      ...subject,
      creditsUsed: 0 // Initialize credits used to 0
    }));
    
    subjectsWithCredits.forEach(({ frequency }) => {
      total += frequency * 40; // KSH 40 per lesson
      totalLessons += frequency;
    });

    // ⏰ Set expiry date for weekly plan
    const startDate = new Date();
    const expiryDate = new Date(startDate);
    expiryDate.setDate(startDate.getDate() + 7);

    // 🗃 Save subscription WITH CREDIT TRACKING
    const subscription = new Subscription({
      student: studentId,
      subjects: subjectsWithCredits, // Now includes creditsUsed field
      lessons: totalLessons, // Total lessons per week
      creditsUsed: 0, // Initialize total credits used
      creditsRemaining: totalLessons, // Initialize remaining credits
      amountPaid: total,
      phone,
      transactionId,
      startDate,
      expiryDate,
      status: "active",
    });

    await subscription.save();

    res.status(201).json({
      message: "✅ Weekly subscription created successfully!",
      subscription,
    });
  } catch (error) {
    console.error("Error creating subscription:", error);
    res.status(500).json({ message: error.message });
  }
});

/* ===================================================
   🔍 CHECK ACTIVE SUBSCRIPTION (Student Only)
   - Returns null if no active subscription instead of 403
=================================================== */
router.get("/check", verifyToken, roleCheck(["student"]), async (req, res) => {
  try {
    const studentId = req.user.id;

    // Check if student has an active subscription
    const activeSub = await Subscription.findOne({
      student: studentId,
      status: "active",
      expiryDate: { $gte: new Date() },
    });

    // If no active subscription, return null instead of 403
    if (!activeSub) {
      return res.status(200).json({
        subscription: null,
        message: "No active subscription yet. Dashboard will show limited access."
      });
    }

    // Active subscription found
    res.status(200).json({
      subscription: activeSub,
      message: "Active subscription found."
    });
  } catch (error) {
    console.error("Error checking subscription:", error);
    res.status(500).json({ message: error.message });
  }
});

/* ===================================================
   📊 GET SUBJECT PRICING INFO (For frontend reference) - UPDATED WITH FIXED FREQUENCIES
=================================================== */
router.get("/pricing", verifyToken, roleCheck(["student"]), async (req, res) => {
  try {
    const subjectPricing = [
      { subject: "Mathematics", frequency: 5, costPerLesson: 40, weeklyCost: 200 },
      { subject: "Chemistry", frequency: 4, costPerLesson: 40, weeklyCost: 160 },
      { subject: "English", frequency: 4, costPerLesson: 40, weeklyCost: 160 },
      { subject: "Kiswahili", frequency: 3, costPerLesson: 40, weeklyCost: 120 },
      { subject: "Biology", frequency: 3, costPerLesson: 40, weeklyCost: 120 },
      { subject: "Business", frequency: 3, costPerLesson: 40, weeklyCost: 120 },
      { subject: "Agriculture", frequency: 3, costPerLesson: 40, weeklyCost: 120 },
      { subject: "CRE", frequency: 3, costPerLesson: 40, weeklyCost: 120 },
      { subject: "Physics", frequency: 2, costPerLesson: 40, weeklyCost: 80 },
    ];

    res.json({
      message: "✅ Subject pricing information",
      pricing: subjectPricing,
      baseRate: 40, // KSH per lesson
      plan: "weekly",
      note: "Frequencies are fixed per subject as shown"
    });
  } catch (error) {
    console.error("Error getting pricing:", error);
    res.status(500).json({ message: error.message });
  }
});

/* ===================================================
   📈 GET CREDIT BALANCE
=================================================== */
router.get("/credit-balance", verifyToken, async (req, res) => {
  try {
    const studentId = req.user.id;

    const subscription = await Subscription.findOne({
      student: studentId,
      status: { $in: ["active", "used"] },
      expiryDate: { $gte: new Date() }
    });

    if (!subscription) {
      return res.status(404).json({ 
        message: "No active subscription found." 
      });
    }

    const subjectBreakdown = subscription.subjects.map(subject => ({
      subject: subject.subject,
      frequency: subject.frequency,
      creditsUsed: subject.creditsUsed || 0,
      creditsRemaining: subject.frequency - (subject.creditsUsed || 0)
    }));

    res.json({
      totalCredits: subscription.lessons,
      creditsUsed: subscription.creditsUsed || 0,
      creditsRemaining: subscription.creditsRemaining || subscription.lessons,
      expiryDate: subscription.expiryDate,
      status: subscription.status,
      subjectBreakdown
    });

  } catch (error) {
    console.error("Error checking credit balance:", error);
    res.status(500).json({ message: error.message });
  }
});

/* ===================================================
   ⚙️ AUTO-EXPIRE OLD SUBSCRIPTIONS - UPDATED FOR CREDITS
=================================================== */
router.put("/expire", async (req, res) => {
  try {
    const result = await Subscription.updateMany(
      { 
        $or: [
          { expiryDate: { $lt: new Date() }, status: "active" },
          { creditsRemaining: 0, status: "active" }
        ]
      },
      { $set: { status: "expired" } }
    );

    res.json({ message: "✅ Expired/used subscriptions updated.", result });
  } catch (error) {
    console.error("Error expiring subscriptions:", error);
    res.status(500).json({ message: error.message });
  }
});

export default router;