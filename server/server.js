import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http"; // ✅ ADD THIS
import { Server } from "socket.io"; // ✅ ADD THIS

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
import paymentAdminRoutes from "./routes/paymentAdminRoutes.js";
import creditRoutes from "./routes/creditRoutes.js";

import "./config/emailConfig.js";

dotenv.config();
const app = express();

// ✅ Create HTTP server
const server = createServer(app); // ✅ ADD THIS

// ✅ Socket.io setup
const io = new Server(server, {
  cors: {
    origin: "https://virtual-classroom-app-three.vercel.app",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ✅ Store active sessions and their sockets
const activeSessions = new Map();

// ✅ Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`🔌 New socket connected: ${socket.id}`);

  // Join a live session room
  socket.on("join-session", (data) => {
    const { sessionId, userId, userRole } = data;
    
    socket.join(sessionId);
    socket.sessionId = sessionId;
    socket.userId = userId;
    
    // Store socket in active sessions
    if (!activeSessions.has(sessionId)) {
      activeSessions.set(sessionId, new Map());
    }
    activeSessions.get(sessionId).set(userId, socket.id);
    
    console.log(`🎯 User ${userId} (${userRole}) joined session ${sessionId}`);
    
    // Notify others in the session
    socket.to(sessionId).emit("user-joined", {
      userId,
      userRole,
      socketId: socket.id,
      timestamp: new Date()
    });
  });

  // ✅ Mute specific student (Teacher only)
  socket.on("mute-student", async (data) => {
    const { sessionId, targetId, teacherId } = data;
    
    try {
      // Verify teacher owns the session
      const liveSession = await LiveSession.findById(sessionId);
      if (!liveSession || liveSession.teacherId.toString() !== teacherId) {
        socket.emit("error", { message: "Unauthorized to mute students" });
        return;
      }

      // Emit to specific student
      io.to(sessionId).emit("mute-student", {
        targetId,
        teacherId,
        timestamp: new Date(),
        message: "You have been muted by the teacher"
      });
      
      console.log(`🔇 Teacher ${teacherId} muted student ${targetId} in session ${sessionId}`);
      
    } catch (error) {
      console.error("Error in mute-student:", error);
      socket.emit("error", { message: "Failed to mute student" });
    }
  });

  // ✅ Unmute specific student (Teacher only)
  socket.on("unmute-student", async (data) => {
    const { sessionId, targetId, teacherId } = data;
    
    try {
      // Verify teacher owns the session
      const liveSession = await LiveSession.findById(sessionId);
      if (!liveSession || liveSession.teacherId.toString() !== teacherId) {
        socket.emit("error", { message: "Unauthorized to unmute students" });
        return;
      }

      // Emit to specific student
      io.to(sessionId).emit("unmute-student", {
        targetId,
        teacherId,
        timestamp: new Date(),
        message: "You have been unmuted by the teacher"
      });
      
      console.log(`🎤 Teacher ${teacherId} unmuted student ${targetId} in session ${sessionId}`);
      
    } catch (error) {
      console.error("Error in unmute-student:", error);
      socket.emit("error", { message: "Failed to unmute student" });
    }
  });

  // ✅ Mute all students (Teacher only)
  socket.on("mute-all", async (data) => {
    const { sessionId, teacherId } = data;
    
    try {
      // Verify teacher owns the session
      const liveSession = await LiveSession.findById(sessionId);
      if (!liveSession || liveSession.teacherId.toString() !== teacherId) {
        socket.emit("error", { message: "Unauthorized to mute all students" });
        return;
      }

      // Emit to all students in session
      io.to(sessionId).emit("mute-all", {
        teacherId,
        timestamp: new Date(),
        message: "All students have been muted"
      });
      
      console.log(`🔇 Teacher ${teacherId} muted all students in session ${sessionId}`);
      
    } catch (error) {
      console.error("Error in mute-all:", error);
      socket.emit("error", { message: "Failed to mute all students" });
    }
  });

  // ✅ Unmute all students (Teacher only)
  socket.on("unmute-all", async (data) => {
    const { sessionId, teacherId } = data;
    
    try {
      // Verify teacher owns the session
      const liveSession = await LiveSession.findById(sessionId);
      if (!liveSession || liveSession.teacherId.toString() !== teacherId) {
        socket.emit("error", { message: "Unauthorized to unmute all students" });
        return;
      }

      // Emit to all students in session
      io.to(sessionId).emit("unmute-all", {
        teacherId,
        timestamp: new Date(),
        message: "All students have been unmuted"
      });
      
      console.log(`🎤 Teacher ${teacherId} unmuted all students in session ${sessionId}`);
      
    } catch (error) {
      console.error("Error in unmute-all:", error);
      socket.emit("error", { message: "Failed to unmute all students" });
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
    
    if (socket.sessionId && socket.userId) {
      const sessionSockets = activeSessions.get(socket.sessionId);
      if (sessionSockets) {
        sessionSockets.delete(socket.userId);
        if (sessionSockets.size === 0) {
          activeSessions.delete(socket.sessionId);
        }
      }
      
      // Notify others in the session
      socket.to(socket.sessionId).emit("user-left", {
        userId: socket.userId,
        socketId: socket.id,
        timestamp: new Date()
      });
    }
  });

  // Error handling
  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
});

// ✅ Make io available to routes
app.set("io", io);

// ✅ Middlewares (always before routes)
app.use(
  cors({
    origin: "https://virtual-classroom-app-three.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// ✅ Static folder to serve uploaded files
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
app.use("/api/admin/payments", paymentAdminRoutes);
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

// ✅ Server port - CHANGE from app.listen to server.listen
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT} with Socket.io`));