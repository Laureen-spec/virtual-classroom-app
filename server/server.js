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

  // ✅ UPDATED: Mute specific student - REMOVE PERMISSION LOGIC
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

      // ✅ UPDATED: Only update mute status, not permissions
      const pIndex = liveSession.participants.findIndex(p => p.studentId.toString() === String(targetId));
      if (pIndex !== -1) {
        liveSession.participants[pIndex].isMuted = true;
        // ❌ REMOVED: liveSession.participants[pIndex].hasSpeakingPermission = false;
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

      // ✅ ADD: Broadcast participant update with mute status
      io.in(sessionId).emit("participant-updated", {
        studentId: targetId,
        isMuted: true,
        timestamp: new Date()
      });

      console.log(`🔇 Teacher ${teacherId} muted student ${targetId} in session ${sessionId}`);
      
    } catch (error) {
      console.error("Error in mute-student:", error);
      socket.emit("error", { message: "Failed to mute student" });
    }
  });

  // ✅ UPDATED: Unmute specific student - REMOVE PERMISSION LOGIC
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

      // ✅ UPDATED: Only update mute status, not permissions
      const pIndex = liveSession.participants.findIndex(p => p.studentId.toString() === String(targetId));
      if (pIndex !== -1) {
        liveSession.participants[pIndex].isMuted = false;
        // ❌ REMOVED: liveSession.participants[pIndex].hasSpeakingPermission = true;
        // ❌ REMOVED: liveSession.participants[pIndex].permissionRequested = false;
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

      // ✅ ADD: Broadcast participant update with unmute status
      io.in(sessionId).emit("participant-updated", {
        studentId: targetId,
        isMuted: false,
        timestamp: new Date()
      });

      console.log(`🎤 Teacher ${teacherId} unmuted student ${targetId} in session ${sessionId}`);
      
    } catch (error) {
      console.error("Error in unmute-student:", error);
      socket.emit("error", { message: "Failed to unmute student" });
    }
  });

  // ✅ UPDATED: Mute all students - REMOVE PERMISSION LOGIC
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

      // ✅ UPDATED: Only mute non-host participants, don't revoke permissions
      let mutedCount = 0;
      liveSession.participants.forEach((participant, index) => {
        if (participant.role !== "host") {
          liveSession.participants[index].isMuted = true;
          // ❌ REMOVED: liveSession.participants[index].hasSpeakingPermission = false;
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

      // ✅ ADD: Broadcast participant updates for all muted students
      liveSession.participants.forEach(participant => {
        if (participant.role !== "host") {
          io.in(sessionId).emit("participant-updated", {
            studentId: participant.studentId,
            isMuted: true,
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

  // ✅ UPDATED: Unmute all students - REMOVE PERMISSION LOGIC
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

      // ✅ UPDATED: Only unmute non-host participants, don't grant permissions
      let unmutedCount = 0;
      liveSession.participants.forEach((participant, index) => {
        if (participant.role !== "host") {
          liveSession.participants[index].isMuted = false;
          // ❌ REMOVED: liveSession.participants[index].hasSpeakingPermission = true;
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

      // ✅ ADD: Broadcast participant updates for all unmuted students
      liveSession.participants.forEach(participant => {
        if (participant.role !== "host") {
          io.in(sessionId).emit("participant-updated", {
            studentId: participant.studentId,
            isMuted: false,
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