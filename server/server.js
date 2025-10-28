import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// ✅ Fix for ES module path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔹 Import Routes
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import teacherRoutes from "./routes/teacherRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import enrollmentRoutes from "./routes/enrollmentRoutes.js";
import mpesaRoutes from "./routes/mpesaRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import "./cron/subscriptionCron.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import scheduleRoutes from "./routes/scheduleRoutes.js";
import "./utils/notificationScheduler.js";
import materialRoutes from "./routes/materialRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import timetableRoutes from "./routes/timetableRoutes.js";
import liveClassRoutes from "./routes/liveClassRoutes.js";
//import paymentAdminRoutes from "./routes/paymentAdminroutes.js";
import creditRoutes from "./routes/creditRoutes.js";

import "./config/emailConfig.js";


dotenv.config();
const app = express();

// ✅ Middlewares (always before routes)
app.use(cors());
app.use(express.json());

// ✅ Static folder to serve uploaded files
// (This allows student & teacher to access materials in /uploads)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/mpesa", mpesaRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/schedule", scheduleRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/live", liveClassRoutes);
//app.use("/api/admin/payments", paymentAdminRoutes);
app.use("/api/credits", creditRoutes);
// ✅ Default route
app.get("/", (req, res) => {
  res.send("Virtual Classroom Backend is running...");
});

// ✅ MongoDB connection
mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/virtual_classroom_db")
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch((err) => console.log("❌ MongoDB Connection Error:", err));

// ✅ Server port
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));