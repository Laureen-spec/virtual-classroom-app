import cron from "node-cron";
import Subscription from "../models/Subscription.js";
import Notification from "../models/Notification.js";

const checkExpiredSubscriptions = async () => {
  try {
    const now = new Date();

    // 🔹 Step 1: Mark expired subscriptions
    const expiredSubs = await Subscription.updateMany(
      { expiryDate: { $lt: now }, status: "active" },
      { $set: { status: "expired" } }
    );

    if (expiredSubs.modifiedCount > 0) {
      console.log(`⚠️ ${expiredSubs.modifiedCount} subscriptions expired automatically.`);
    } else {
      console.log("✅ No expired subscriptions found today.");
    }

    // 🔹 Step 2: Notify users whose subscriptions expire within 24 hours
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);

    const expiringSoon = await Subscription.find({
      expiryDate: { $gte: now, $lt: tomorrow },
      status: "active",
    }).populate("student", "name email");

    for (const sub of expiringSoon) {
      await Notification.create({
        user: sub.student._id,
        message: `Your ${sub.planType} plan will expire soon. Please renew.`,
        type: "warning",
      });
      console.log(`🔔 Reminder created for ${sub.student.email}`);
    }
  } catch (error) {
    console.error("❌ Cron Job Error:", error.message);
  }
};

// 🔹 Run every day at midnight (00:00)
cron.schedule("0 0 * * *", () => {
  console.log("🕛 Running daily subscription expiry & reminder check...");
  checkExpiredSubscriptions();
});

export default checkExpiredSubscriptions;
