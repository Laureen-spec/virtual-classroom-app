import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

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
const server = createServer(app);

// ✅ Enhanced CORS configuration for multiple domains
const allowedOrigins = [
  "https://virtual-classroom-app-three.vercel.app",
  "https://virtual-classroom-app-8wbh.onrender.com"
];

// ✅ Socket.io setup with enhanced CORS
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        console.log('❌ CORS blocked origin:', origin);
        return callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  },
});

// ✅ Store active sessions and their sockets
const activeSessions = new Map();

// ✅ Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`🔌 New socket connected: ${socket.id}`);

  // ✅ UPDATED: Join a live session room with string normalization
  socket.on("join-session", (data) => {
    const { sessionId, userId, userRole } = data;

    socket.join(sessionId);
    socket.sessionId = String(sessionId);
    socket.userId = String(userId);

    // ✅ Normalize both keys to string
    const sid = String(sessionId);
    const uid = String(userId);

    if (!activeSessions.has(sid)) {
      activeSessions.set(sid, new Map());
    }
    activeSessions.get(sid).set(uid, socket.id);

    console.log(`🎯 User ${uid} (${userRole}) joined session ${sid}`);
    
    // Notify others in the session
    socket.to(sid).emit("user-joined", {
      userId: uid,
      userRole,
      socketId: socket.id,
      timestamp: new Date()
    });
  });

  // ✅ ENHANCED: Mute specific student (Teacher only) - TARGETS SPECIFIC SOCKET ID
  socket.on("mute-student", async (data) => {
    const { sessionId, targetId, teacherId } = data;
    
    try {
      // Dynamic import to avoid circular dependencies
      const LiveSession = (await import("./models/LiveSession.js")).default;
      
      // Verify teacher owns the session
      const liveSession = await LiveSession.findById(sessionId);
      if (!liveSession || liveSession.teacherId.toString() !== teacherId) {
        socket.emit("error", { message: "Unauthorized to mute students" });
        return;
      }

      // Update DB: set participant.isMuted = true and revoke speaking permission
      const pIndex = liveSession.participants.findIndex(p => p.studentId.toString() === String(targetId));
      if (pIndex !== -1) {
        liveSession.participants[pIndex].isMuted = true;
        liveSession.participants[pIndex].hasSpeakingPermission = false;
        await liveSession.save();
      }

      // ✅ UPDATED: Find socket id with string normalization
      const sessionSockets = activeSessions.get(String(sessionId));
      const targetSocketId = sessionSockets ? sessionSockets.get(String(targetId)) : null;

      // Emit direct event to the target if online
      if (targetSocketId) {
        io.to(targetSocketId).emit("mute-student", { 
          targetId, 
          teacherId, 
          timestamp: new Date(),
          message: "You have been muted by the teacher"
        });
        console.log(`🔇 Sent mute-student to socket ${targetSocketId} for user ${targetId}`);
      }

      // Also broadcast updated participant data to the whole room for sync
      io.in(sessionId).emit("participant-updated", {
        studentId: targetId,
        isMuted: true,
        hasSpeakingPermission: false,
        timestamp: new Date()
      });

      console.log(`🔇 Teacher ${teacherId} muted student ${targetId} in session ${sessionId}`);
      
    } catch (error) {
      console.error("Error in mute-student:", error);
      socket.emit("error", { message: "Failed to mute student" });
    }
  });

  // ✅ ENHANCED: Unmute specific student (Teacher only) - TARGETS SPECIFIC SOCKET ID
  socket.on("unmute-student", async (data) => {
    const { sessionId, targetId, teacherId } = data;
    
    try {
      // Dynamic import to avoid circular dependencies
      const LiveSession = (await import("./models/LiveSession.js")).default;
      
      // Verify teacher owns the session
      const liveSession = await LiveSession.findById(sessionId);
      if (!liveSession || liveSession.teacherId.toString() !== teacherId) {
        socket.emit("error", { message: "Unauthorized to unmute students" });
        return;
      }

      // Update DB: set participant.isMuted = false and grant speaking permission
      const pIndex = liveSession.participants.findIndex(p => p.studentId.toString() === String(targetId));
      if (pIndex !== -1) {
        liveSession.participants[pIndex].isMuted = false;
        liveSession.participants[pIndex].hasSpeakingPermission = true;
        liveSession.participants[pIndex].permissionRequested = false;
        await liveSession.save();
      }

      // ✅ UPDATED: Find socket id with string normalization
      const sessionSockets = activeSessions.get(String(sessionId));
      const targetSocketId = sessionSockets ? sessionSockets.get(String(targetId)) : null;

      // Emit direct event to the target if online
      if (targetSocketId) {
        io.to(targetSocketId).emit("unmute-student", { 
          targetId, 
          teacherId, 
          timestamp: new Date(),
          message: "You have been unmuted by the teacher"
        });
        console.log(`🎤 Sent unmute-student to socket ${targetSocketId} for user ${targetId}`);
      }

      // Also broadcast updated participant data to the whole room for sync
      io.in(sessionId).emit("participant-updated", {
        studentId: targetId,
        isMuted: false,
        hasSpeakingPermission: true,
        timestamp: new Date()
      });

      console.log(`🎤 Teacher ${teacherId} unmuted student ${targetId} in session ${sessionId}`);
      
    } catch (error) {
      console.error("Error in unmute-student:", error);
      socket.emit("error", { message: "Failed to unmute student" });
    }
  });

  // ✅ Mute all students (Teacher only) - PRESERVED ORIGINAL FUNCTIONALITY
  socket.on("mute-all", async (data) => {
    const { sessionId, teacherId } = data;
    
    try {
      // Dynamic import to avoid circular dependencies
      const LiveSession = (await import("./models/LiveSession.js")).default;
      
      // Verify teacher owns the session
      const liveSession = await LiveSession.findById(sessionId);
      if (!liveSession || liveSession.teacherId.toString() !== teacherId) {
        socket.emit("error", { message: "Unauthorized to mute all students" });
        return;
      }

      // Update DB: mute all non-host participants
      let mutedCount = 0;
      liveSession.participants.forEach((participant, index) => {
        if (participant.role !== "host") {
          liveSession.participants[index].isMuted = true;
          liveSession.participants[index].hasSpeakingPermission = false;
          mutedCount++;
        }
      });
      await liveSession.save();

      // Emit to all students in session
      io.to(sessionId).emit("mute-all", {
        teacherId,
        timestamp: new Date(),
        message: "All students have been muted"
      });

      // Broadcast participant updates for all muted students
      liveSession.participants.forEach(participant => {
        if (participant.role !== "host") {
          io.in(sessionId).emit("participant-updated", {
            studentId: participant.studentId,
            isMuted: true,
            hasSpeakingPermission: false,
            timestamp: new Date()
          });
        }
      });
      
      console.log(`🔇 Teacher ${teacherId} muted all students (${mutedCount}) in session ${sessionId}`);
      
    } catch (error) {
      console.error("Error in mute-all:", error);
      socket.emit("error", { message: "Failed to mute all students" });
    }
  });

  // ✅ Unmute all students (Teacher only) - PRESERVED ORIGINAL FUNCTIONALITY
  socket.on("unmute-all", async (data) => {
    const { sessionId, teacherId } = data;
    
    try {
      // Dynamic import to avoid circular dependencies
      const LiveSession = (await import("./models/LiveSession.js")).default;
      
      // Verify teacher owns the session
      const liveSession = await LiveSession.findById(sessionId);
      if (!liveSession || liveSession.teacherId.toString() !== teacherId) {
        socket.emit("error", { message: "Unauthorized to unmute all students" });
        return;
      }

      // Update DB: unmute all non-host participants
      let unmutedCount = 0;
      liveSession.participants.forEach((participant, index) => {
        if (participant.role !== "host") {
          liveSession.participants[index].isMuted = false;
          liveSession.participants[index].hasSpeakingPermission = true;
          unmutedCount++;
        }
      });
      await liveSession.save();

      // Emit to all students in session
      io.to(sessionId).emit("unmute-all", {
        teacherId,
        timestamp: new Date(),
        message: "All students have been unmuted"
      });

      // Broadcast participant updates for all unmuted students
      liveSession.participants.forEach(participant => {
        if (participant.role !== "host") {
          io.in(sessionId).emit("participant-updated", {
            studentId: participant.studentId,
            isMuted: false,
            hasSpeakingPermission: true,
            timestamp: new Date()
          });
        }
      });
      
      console.log(`🎤 Teacher ${teacherId} unmuted all students (${unmutedCount}) in session ${sessionId}`);
      
    } catch (error) {
      console.error("Error in unmute-all:", error);
      socket.emit("error", { message: "Failed to unmute all students" });
    }
  });

  // ✅ UPDATED: Handle disconnection with string normalization
  socket.on("disconnect", () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
    
    if (socket.sessionId && socket.userId) {
      // ✅ Normalize both keys to string
      const sid = String(socket.sessionId);
      const uid = String(socket.userId);
      
      const sessionSockets = activeSessions.get(sid);
      if (sessionSockets) {
        sessionSockets.delete(uid);
        if (sessionSockets.size === 0) {
          activeSessions.delete(sid);
        }
      }
      
      // Notify others in the session
      socket.to(sid).emit("user-left", {
        userId: uid,
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

// ✅ Enhanced CORS middleware for Express routes
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        console.log('❌ Express CORS blocked origin:', origin);
        return callback(new Error("Not allowed by CORS"));
      }
    },
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