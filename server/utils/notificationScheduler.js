import cron from "node-cron";
import Notification from "../models/Notification.js";
import Subscription from "../models/Subscription.js";
import ClassSchedule from "../models/ClassSchedule.js";

// 🔁 Run every hour
cron.schedule("0 * * * *", async () => {
  console.log("⏰ Running notification scheduler...");

  try {
    // 1️⃣ Subscription Expiry Alerts (expiring in 1 day)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expiringSubs = await Subscription.find({ expiryDate: { $lte: tomorrow } });

    for (const sub of expiringSubs) {
      await Notification.create({
        userId: sub.userId,
        type: "student",
        message: "⚠️ Your subscription will expire soon. Renew to keep learning!",
      });
    }

    // 2️⃣ Class Reminders (1 hour before start)
    const now = new Date();
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
    const upcomingClasses = await ClassSchedule.find({
      startTime: { $gte: now, $lte: inOneHour },
    }).populate("teacher");

    for (const c of upcomingClasses) {
      await Notification.create({
        userId: c.teacher._id,
        type: "teacher",
        message: `📅 Reminder: Your class "${c.title}" starts in one hour.`,
      });
    }

    console.log("✅ Notifications created successfully");
  } catch (error) {
    console.error("❌ Scheduler error:", error);
  }
});
