// creditRoutes.js - Enhanced with class tracking and rejoining
import express from "express";
import Subscription from "../models/Subscription.js";
import { verifyToken, roleCheck } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ===================================================
   📚 CONSUME CREDIT WITH CLASS TRACKING & REJOINING
=================================================== */
router.post("/consume", verifyToken, roleCheck(["student", "teacher"]), async (req, res) => {
  try {
    const { studentId, subject, classId, allowRejoin = false } = req.body;
    const userId = req.user.id;

    console.log("🔍 CONSUME CREDIT - Enhanced:", {
      studentId,
      subject,
      classId,
      allowRejoin,
      userId
    });

    // Validate required fields
    if (!classId) {
      return res.status(400).json({ 
        message: "Class ID is required to track attendance." 
      });
    }

    // Find active subscription
    const subscription = await Subscription.findOne({
      student: studentId,
      status: "active",
      expiryDate: { $gte: new Date() }
    });

    if (!subscription) {
      return res.status(400).json({ 
        message: "❌ No active subscription found." 
      });
    }

    // Initialize missing credits fields
    if (typeof subscription.creditsUsed === 'undefined' || subscription.creditsUsed === null) {
      subscription.creditsUsed = 0;
    }
    if (typeof subscription.creditsRemaining === 'undefined' || subscription.creditsRemaining === null) {
      subscription.creditsRemaining = subscription.lessons;
    }

    console.log("📊 Subscription details:", {
      creditsRemaining: subscription.creditsRemaining,
      attendedClasses: subscription.attendedClasses?.length || 0,
      subjects: subscription.subjects.map(s => ({
        subject: s.subject,
        creditsUsed: s.creditsUsed,
        frequency: s.frequency
      }))
    });

    // Use enhanced consumeCredit method
    const result = subscription.consumeCredit(subject, classId, allowRejoin);
    await subscription.save();

    console.log("✅ Credit consumption result:", result);

    res.json({
      message: result.message || `✅ ${result.rejoined ? 'Rejoined' : 'Joined'} class for ${subject}`,
      ...result
    });

  } catch (error) {
    console.error("❌ Error consuming credit:", error);
    res.status(500).json({ message: error.message });
  }
});

/* ===================================================
   🔍 CHECK IF STUDENT CAN JOIN CLASS (Frontend validation)
=================================================== */
router.post("/can-join", verifyToken, async (req, res) => {
  try {
    const { studentId, subject, classId } = req.body;

    if (!classId) {
      return res.status(400).json({ 
        message: "Class ID is required." 
      });
    }

    const subscription = await Subscription.findOne({
      student: studentId,
      status: "active",
      expiryDate: { $gte: new Date() }
    });

    if (!subscription) {
      return res.json({ 
        canJoin: false, 
        reason: "No active subscription found",
        requiresPayment: true 
      });
    }

    const canJoinResult = subscription.canJoinClass(subject, classId);
    
    res.json({
      ...canJoinResult,
      subscriptionActive: true,
      expiryDate: subscription.expiryDate,
      totalCreditsRemaining: subscription.creditsRemaining
    });

  } catch (error) {
    console.error("❌ Error checking class join eligibility:", error);
    res.status(500).json({ message: error.message });
  }
});

/* ===================================================
   📋 GET CLASS ATTENDANCE HISTORY
=================================================== */
router.get("/attendance/:studentId", verifyToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    const subscription = await Subscription.findOne({
      student: studentId
    }).select('attendedClasses subjects status expiryDate');

    if (!subscription) {
      return res.status(404).json({ 
        message: "No subscription found for this student." 
      });
    }

    // Group attendance by subject
    const attendanceBySubject = {};
    subscription.attendedClasses.forEach(attendance => {
      if (!attendanceBySubject[attendance.subject]) {
        attendanceBySubject[attendance.subject] = [];
      }
      attendanceBySubject[attendance.subject].push({
        classId: attendance.classId,
        date: attendance.date,
        rejoined: attendance.rejoined
      });
    });

    res.json({
      totalClassesAttended: subscription.attendedClasses.length,
      uniqueClassesAttended: new Set(subscription.attendedClasses.map(a => a.classId)).size,
      attendanceBySubject,
      subscriptionStatus: subscription.status,
      expiryDate: subscription.expiryDate
    });

  } catch (error) {
    console.error("❌ Error fetching attendance:", error);
    res.status(500).json({ message: error.message });
  }
});

/* ===================================================
   🔍 CHECK CREDIT BALANCE - Enhanced with attendance info
=================================================== */
router.get("/balance/:studentId", verifyToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    const subscription = await Subscription.findOne({
      student: studentId,
      status: "active",
      expiryDate: { $gte: new Date() }
    });

    if (!subscription) {
      return res.status(404).json({ 
        message: "No active subscription found." 
      });
    }

    // Initialize missing fields for response
    const totalCredits = subscription.lessons;
    const creditsUsed = subscription.creditsUsed || 0;
    let creditsRemaining = subscription.creditsRemaining;

    if (typeof creditsRemaining === 'undefined' || creditsRemaining === null || creditsRemaining < 0) {
      creditsRemaining = totalCredits - creditsUsed;
    }

    // Enhanced subject breakdown with attendance
    const subjectBreakdown = subscription.subjects.map(subject => {
      const subCreditsUsed = subject.creditsUsed || 0;
      const subCreditsRemaining = Math.max(0, subject.frequency - subCreditsUsed);
      
      // Count classes attended for this subject
      const classesAttended = subscription.attendedClasses?.filter(
        cls => cls.subject === subject.subject
      ).length || 0;

      return {
        subject: subject.subject,
        frequency: subject.frequency,
        creditsUsed: subCreditsUsed,
        creditsRemaining: subCreditsRemaining,
        classesAttended: classesAttended
      };
    });

    const response = {
      totalCredits,
      creditsUsed,
      creditsRemaining,
      expiryDate: subscription.expiryDate,
      status: subscription.status,
      totalClassesAttended: subscription.attendedClasses?.length || 0,
      subjectBreakdown
    };

    res.json(response);

  } catch (error) {
    console.error("❌ Error checking credit balance:", error);
    res.status(500).json({ message: error.message });
  }
});

/* ===================================================
   🛠️ FIX MISSING CREDITS & ATTENDANCE FIELDS
=================================================== */
router.put("/fix-all", verifyToken, roleCheck(["admin"]), async (req, res) => {
  try {
    console.log("🛠️ Fixing all subscription data...");
    
    const subscriptions = await Subscription.find({});

    let fixedCount = 0;

    for (const subscription of subscriptions) {
      let needsFix = false;

      // Fix credits fields
      if (typeof subscription.creditsUsed === 'undefined' || subscription.creditsUsed === null) {
        subscription.creditsUsed = 0;
        needsFix = true;
      }
      
      if (typeof subscription.creditsRemaining === 'undefined' || subscription.creditsRemaining === null) {
        subscription.creditsRemaining = subscription.lessons;
        needsFix = true;
      }

      // Fix subject creditsUsed fields
      subscription.subjects = subscription.subjects.map(subject => ({
        ...subject.toObject?.() || subject,
        creditsUsed: subject.creditsUsed || 0
      }));

      // Initialize attendedClasses if missing
      if (!subscription.attendedClasses) {
        subscription.attendedClasses = [];
        needsFix = true;
      }

      if (needsFix) {
        await subscription.save();
        fixedCount++;
        console.log(`✅ Fixed subscription: ${subscription._id}`);
      }
    }

    res.json({
      message: `✅ Fixed ${fixedCount} subscriptions`,
      fixedCount
    });

  } catch (error) {
    console.error("❌ Error fixing subscriptions:", error);
    res.status(500).json({ message: error.message });
  }
});

export default router;