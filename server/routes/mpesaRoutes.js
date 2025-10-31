import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import PaymentRecord from "../models/PaymentRecord.js";
import { verifyToken, roleCheck } from "../middleware/authMiddleware.js";

dotenv.config();
const router = express.Router();

/* ===================================================
   🔹 Generate M-Pesa Access Token
=================================================== */
const generateToken = async () => {
  const url = "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const response = await axios.get(url, {
    headers: { Authorization: `Basic ${auth}` },
  });

  return response.data.access_token;
};

/* ===================================================
   💳 STK PUSH - WEEKLY SUBJECT FREQUENCY PAYMENT
=================================================== */
router.post("/stkpush", verifyToken, roleCheck(["student"]), async (req, res) => {
  try {
    const { phone, subjects } = req.body; // subjects now contains {subject, frequency}
    const studentId = req.user.id;

    // 🧮 Validate data
    if (!subjects || subjects.length === 0) {
      return res.status(400).json({ message: "Please select at least one subject." });
    }

    // Define subject FIXED frequencies (as per requirements)
    const subjectFixedFreq = {
      "Mathematics": 5,
      "Chemistry": 4,
      "English": 4,
      "Kiswahili": 3,
      "Biology": 3,
      "Business": 3,
      "Agriculture": 3,
      "CRE": 3,
      "Physics": 2,
      // ADD THESE TWO NEW SUBJECTS:
      "Geography": 3,
      "History": 3
    };

    // 🧮 Validate subject frequencies and calculate total cost
    let total = 0;
    let totalLessons = 0;
    const validatedSubjects = [];

    for (const sub of subjects) {
      const { subject, frequency } = sub;
      
      // Validate subject exists in our list
      if (!subjectFixedFreq[subject]) {
        return res.status(400).json({ message: `Invalid subject: ${subject}` });
      }

      // ✅ UPDATED: Validate frequency matches the fixed requirement
      if (frequency !== subjectFixedFreq[subject]) {
        return res.status(400).json({ 
          message: `Frequency for ${subject} must be exactly ${subjectFixedFreq[subject]} times per week` 
        });
      }

      // Calculate cost for this subject (KSH 40 per lesson)
      const subjectCost = frequency * 40;
      total += subjectCost;
      totalLessons += frequency;
      
      // Initialize with creditsUsed: 0 for credit tracking
      validatedSubjects.push({ 
        subject, 
        frequency,
        creditsUsed: 0  // ADDED: Initialize credits used
      });
    }

    // Validate total lessons
    if (totalLessons === 0) {
      return res.status(400).json({ message: "Please select at least one lesson." });
    }

    // Generate M-Pesa token
    const token = await generateToken();
    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const password = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString("base64");

    // ✅ Format phone (07... → 2547...)
    const formattedPhone = phone.startsWith("254")
      ? phone
      : "254" + phone.replace(/^0+/, "");

    // 🔹 STK Push Request
    const response = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: total,
        PartyA: formattedPhone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: formattedPhone,
        CallBackURL: process.env.MPESA_CALLBACK_URL,
        AccountReference: "EduLearn Subscription",
        TransactionDesc: "Weekly Subject Subscription",
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    // ✅ Store pending subscription for callback completion
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7); // Weekly plan - 7 days from now

    const pendingSub = new Subscription({
      student: studentId,
      subjects: validatedSubjects, // Store subject-frequency pairs with creditsUsed
      lessons: totalLessons, // Total lessons per week
      amountPaid: total,
      phone: formattedPhone,
      expiryDate,
      status: "pending",
    });
    await pendingSub.save();

    res.json({
      message: "📱 STK Push sent to your phone. Enter M-Pesa PIN to complete.",
      data: response.data,
      amount: total,
      totalLessons: totalLessons
    });
  } catch (err) {
    console.error("❌ STK Push Error:", err.response?.data || err.message);
    res.status(500).json({
      message: "M-Pesa STK Push failed",
      error: err.response?.data || err.message,
    });
  }
});

/* ===================================================
   🔔 M-PESA CALLBACK — Finalize Subscription & Initialize Credits
=================================================== */
router.post("/callback", async (req, res) => {
  try {
    const body = req.body;
    console.log("📞 M-Pesa Callback Received:", JSON.stringify(body, null, 2));

    const callback = body?.Body?.stkCallback;
    const resultCode = callback?.ResultCode;
    const resultDesc = callback?.ResultDesc;

    if (resultCode === 0) {
      const meta = callback?.CallbackMetadata?.Item;
      const amount = meta.find((i) => i.Name === "Amount")?.Value;
      const phone = meta.find((i) => i.Name === "PhoneNumber")?.Value;
      const receipt = meta.find((i) => i.Name === "MpesaReceiptNumber")?.Value;

      console.log(`✅ Payment Success: ${phone}, Amount: ${amount}, Receipt: ${receipt}`);

      // Find the pending subscription first to get total lessons
      const pendingSubscription = await Subscription.findOne({ phone, status: "pending" });
      
      if (!pendingSubscription) {
        console.log("⚠️ No pending subscription found for this number.");
        return res.status(200).json({ message: "Callback processed - no pending subscription" });
      }

      // Calculate total lessons from pending subscription
      const totalLessons = pendingSubscription.lessons;

      // Update pending subscription for this phone WITH CREDIT TRACKING
      const subscription = await Subscription.findOneAndUpdate(
        { phone, status: "pending" },
        { 
          status: "active", 
          transactionId: receipt, 
          amountPaid: amount,
          creditsUsed: 0,                    // ADDED: Initialize credits used
          creditsRemaining: totalLessons     // ADDED: Initialize credits remaining
        },
        { new: true }
      );

      if (subscription) {
        console.log("🎓 Weekly subscription activated for student:", subscription.student);
        console.log("📚 Subjects:", subscription.subjects);
        console.log("📅 Expiry date:", subscription.expiryDate);
        console.log("💳 Credits initialized:", `${subscription.creditsRemaining} remaining`);
        
        // ✅ CREATE PAYMENT RECORD
        try {
          const paymentRecord = new PaymentRecord({
            student: subscription.student,
            subscription: subscription._id,
            amount: amount,
            phone: phone,
            transactionId: receipt,
            status: "success",
            description: `Weekly subscription - ${subscription.subjects.length} subjects, ${subscription.lessons} lessons`
          });
          await paymentRecord.save();
          console.log("💰 Payment record created:", paymentRecord._id);
        } catch (paymentError) {
          console.error("❌ Error creating payment record:", paymentError.message);
          // Don't fail the whole callback if payment record creation fails
        }
        
      } else {
        console.log("⚠️ Failed to activate subscription for this number.");
      }
    } else {
      console.log(`❌ Payment failed/cancelled: ${resultDesc}`);
      
      // Optionally mark pending subscription as failed
      const callbackMeta = callback?.CallbackMetadata?.Item;
      if (callbackMeta) {
        const phone = callbackMeta.find((i) => i.Name === "PhoneNumber")?.Value;
        if (phone) {
          await Subscription.findOneAndUpdate(
            { phone, status: "pending" },
            { status: "expired" }
          );
          
          // ✅ CREATE FAILED PAYMENT RECORD
          try {
            const failedSubscription = await Subscription.findOne({ phone, status: "expired" });
            if (failedSubscription) {
              const paymentRecord = new PaymentRecord({
                student: failedSubscription.student,
                subscription: failedSubscription._id,
                amount: 0,
                phone: phone,
                transactionId: "FAILED_" + Date.now(),
                status: "failed",
                description: `Payment failed: ${resultDesc}`
              });
              await paymentRecord.save();
              console.log("💰 Failed payment record created");
            }
          } catch (paymentError) {
            console.error("❌ Error creating failed payment record:", paymentError.message);
          }
        }
      }
    }

    res.status(200).json({ message: "Callback processed successfully" });
  } catch (error) {
    console.error("❌ Callback Error:", error.message);
    res.status(500).json({ message: "Callback processing error" });
  }
});

export default router;