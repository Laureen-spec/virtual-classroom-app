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

  // ✅ ADD: Handle session end event with real-time broadcast
  socket.on("end-session", async (data) => {
    const { sessionId, teacherId } = data;
    
    try {
      // Dynamic import to avoid circular dependencies
      const LiveSession = (await import("./models/LiveSession.js")).default;
      
      const liveSession = await LiveSession.findById(sessionId);
      if (!liveSession) {
        socket.emit("error", { message: "Session not found" });
        return;
      }

      // Verify the user ending the session is the teacher
      if (liveSession.teacherId.toString() !== teacherId) {
        socket.emit("error", { message: "Only teacher can end session" });
        return;
      }

      // Update session to inactive
      liveSession.isActive = false;
      liveSession.endTime = new Date();
      await liveSession.save();

      // ✅ CRITICAL: Broadcast session end to ALL participants in real-time
      io.to(sessionId).emit("session-ended", {
        message: "Lesson has ended by teacher",
        sessionId: sessionId,
        endedBy: teacherId,
        timestamp: new Date()
      });

      console.log(`🛑 Session ${sessionId} ended by teacher ${teacherId}`);

    } catch (error) {
      console.error("Error ending session:", error);
      socket.emit("error", { message: "Failed to end session" });
    }
  });

  // ✅ Join a live session room with string normalization
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
    
    // ✅ ADD: Emit participant update to all when user joins
    io.to(sid).emit("participant-updated", {
      studentId: userId,
      userRole,
      joined: true,
      timestamp: new Date()
    });
    
    // Notify others in the session
    socket.to(sid).emit("user-joined", {
      userId: uid,
      userRole,
      socketId: socket.id,
      timestamp: new Date()
    });
  });

  // ✅ ADD: Handle chat messages via socket for real-time updates
  socket.on("send-chat-message", async (data) => {
    const { sessionId, userId, userName, message, messageType = "user" } = data;
    
    try {
      // Dynamic import to avoid circular dependencies
      const LiveSession = (await import("./models/LiveSession.js")).default;
      
      const liveSession = await LiveSession.findById(sessionId);
      if (!liveSession) {
        socket.emit("error", { message: "Session not found" });
        return;
      }

      // Create chat message object
      const chatMessage = {
        userId,
        userName,
        message,
        messageType,
        timestamp: new Date()
      };

      // Add to session's chat messages (limit to last 100 messages)
      liveSession.chatMessages.push(chatMessage);
      if (liveSession.chatMessages.length > 100) {
        liveSession.chatMessages = liveSession.chatMessages.slice(-100);
      }
      await liveSession.save();

      // ✅ ADD: Emit new chat message to all participants in real-time
      io.to(sessionId).emit("new-chat-message", chatMessage);
      
      console.log(`💬 User ${userName} sent message in session ${sessionId}`);
      
    } catch (error) {
      console.error("Error sending chat message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // ✅ ADD: Handle hand raise events for real-time updates
  socket.on("toggle-hand-raise", async (data) => {
    const { sessionId, userId, isHandRaised } = data;
    
    try {
      // Dynamic import to avoid circular dependencies
      const LiveSession = (await import("./models/LiveSession.js")).default;
      
      const liveSession = await LiveSession.findById(sessionId);
      if (!liveSession) {
        socket.emit("error", { message: "Session not found" });
        return;
      }

      // Update participant's hand raise status
      const participantIndex = liveSession.participants.findIndex(
        p => p.studentId.toString() === String(userId)
      );
      
      if (participantIndex !== -1) {
        liveSession.participants[participantIndex].isHandRaised = isHandRaised;
        await liveSession.save();

        // ✅ ADD: Emit participant update with hand raise status
        io.in(sessionId).emit("participant-updated", {
          studentId: userId,
          isHandRaised: isHandRaised,
          timestamp: new Date()
        });

        console.log(`✋ User ${userId} ${isHandRaised ? 'raised' : 'lowered'} hand in session ${sessionId}`);
      }
      
    } catch (error) {
      console.error("Error toggling hand raise:", error);
      socket.emit("error", { message: "Failed to toggle hand raise" });
    }
  });

  // ✅ ADD: Handle session updates (end session, etc.)
  socket.on("session-updated", (data) => {
    const { sessionId, updates } = data;
    
    // Broadcast session updates to all participants
    io.to(sessionId).emit("session-updated", updates);
    console.log(`🔄 Session ${sessionId} updated:`, updates);
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
      
      // ✅ ADD: Emit participant update when user leaves
      socket.to(sid).emit("participant-updated", {
        studentId: uid,
        left: true,
        timestamp: new Date()
      });
      
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