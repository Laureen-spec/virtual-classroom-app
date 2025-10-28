import Subscription from "../models/Subscription.js";

// 🔹 Check if user has active subscription
export const checkSubscription = async (req, res, next) => {
  try {
    // Skip subscription check for teachers and admins
    if (req.user.role === "teacher" || req.user.role === "admin") {
      return next();
    }

    // For students, check active subscription
    const activeSubscription = await Subscription.findOne({
      student: req.user.id,
      status: "active",
      expiryDate: { $gte: new Date() }
    });

    if (!activeSubscription) {
      return res.status(403).json({ 
        message: "❌ Active subscription required to join live classes. Please subscribe first.",
        code: "SUBSCRIPTION_REQUIRED"
      });
    }

    // Attach subscription info to request for later use
    req.subscription = activeSubscription;
    next();
  } catch (error) {
    console.error("Subscription check error:", error);
    res.status(500).json({ message: "Error checking subscription status" });
  }
};

// 🔹 Optional: Check subscription but don't block (for info purposes)
export const getSubscriptionInfo = async (req, res, next) => {
  try {
    if (req.user.role === "student") {
      const subscription = await Subscription.findOne({
        student: req.user.id,
        status: "active",
        expiryDate: { $gte: new Date() }
      });
      
      req.subscription = subscription;
    }
    next();
  } catch (error) {
    console.error("Subscription info error:", error);
    next(); // Continue even if subscription check fails
  }
};