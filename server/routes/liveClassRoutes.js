import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import LiveSession from "../models/LiveSession.js";
import ClassSchedule from "../models/ClassSchedule.js";
import User from "../models/User.js";
import { generateAgoraToken } from "../utils/agoraTokenGenerator.js";
import agoraToken from "agora-token";

const RtcRole = agoraToken.RtcRole;

const router = express.Router();

// ─────────────────────────────────────────────
// 🔹 Start a live class (Teacher only)
// ─────────────────────────────────────────────
router.post("/start", verifyToken, async (req, res) => {
  try {
    const { classId } = req.body;

    if (req.user.role !== "teacher") {
      return res.status(403).json({ message: "Only teachers can start live classes" });
    }

    const classSchedule = await ClassSchedule.findById(classId);
    if (!classSchedule) {
      return res.status(404).json({ message: "Class not found" });
    }

    if (classSchedule.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: "You can only start your own classes" });
    }

    const channelName = `class_${classId}_${Date.now()}`;

    const existingSession = await LiveSession.findOne({ classId, isActive: true });
    if (existingSession) {
      return res.status(400).json({
        message: "A live session is already active for this class",
        sessionId: existingSession._id,
      });
    }

    const liveSession = new LiveSession({
      classId,
      teacherId: req.user.id,
      channelName,
      sessionTitle: classSchedule.title,
      participants: [{
        studentId: req.user.id,
        role: "host",
        isMuted: false,
        isHandRaised: false,
        videoOn: true,
        lastJoinTime: new Date(),
      }],
      settings: { autoMuteNewStudents: true },
    });

    await liveSession.save();

    // Teacher is always PUBLISHER (host)
    const token = generateAgoraToken(channelName, 0, RtcRole.PUBLISHER);

    res.status(201).json({
      message: "Live class started successfully",
      sessionId: liveSession._id,
      channelName,
      token,
      appId: process.env.VITE_AGORA_APP_ID,
    });

  } catch (error) {
    console.error("Error starting live class:", error);
    res.status(500).json({ message: "Failed to start live class", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Check if teacher can rejoin their live session
// ─────────────────────────────────────────────
router.get("/teacher-session/:classId", verifyToken, async (req, res) => {
  try {
    const { classId } = req.params;

    if (req.user.role !== "teacher") {
      return res.status(403).json({ message: "Only teachers can check their sessions" });
    }

    const activeSession = await LiveSession.findOne({
      classId,
      teacherId: req.user.id,
      isActive: true,
    })
      .populate("classId", "title description")
      .populate("teacherId", "name");

    if (!activeSession) {
      return res.status(404).json({
        message: "No active session found for this class",
        hasActiveSession: false,
      });
    }

    res.json({
      message: "Active session found",
      hasActiveSession: true,
      session: {
        id: activeSession._id,
        title: activeSession.sessionTitle,
        channelName: activeSession.channelName,
        startTime: activeSession.startTime,
        participantCount: activeSession.participants.length,
        allowTeacherRejoin: activeSession.allowTeacherRejoin,
      },
    });

  } catch (error) {
    console.error("Error checking teacher session:", error);
    res.status(500).json({ message: "Failed to check teacher session", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Join a live class
//    Teacher/Admin → PUBLISHER (host)
//    Student       → SUBSCRIBER (audience) — zero publishing cost
//    Speaking student → promoted to PUBLISHER temporarily via /promote route
// ─────────────────────────────────────────────
router.post("/join/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Admin verification
    if (req.user.role === "admin") {
      const adminUser = await User.findById(req.user.id);
      if (!adminUser) {
        return res.status(404).json({ message: "Admin user not found in database" });
      }
    }

    const liveSession = await LiveSession.findById(sessionId)
      .populate("classId", "title description")
      .populate("teacherId", "name");

    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    if (!liveSession.isActive) {
      return res.status(400).json({
        message: "This live session has ended",
        details: { isActive: false, endTime: liveSession.endTime, sessionId: liveSession._id },
      });
    }

    const existingParticipant = liveSession.participants.find(
      (p) => p.studentId.toString() === req.user.id
    );

    // ── Role assignment ──────────────────────────────────────────────────────
    // Teacher and admin are PUBLISHER (host). Everyone else is SUBSCRIBER (audience).
    // In Agora Live Streaming mode, SUBSCRIBER audience members consume
    // dramatically fewer minutes than PUBLISHER peers.
    const isHost =
      req.user.role === "admin" ||
      (req.user.role === "teacher" && liveSession.teacherId._id.toString() === req.user.id);

    const agoraRole = isHost ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const isMuted = !isHost; // audience start muted (they have no mic track anyway)

    // ── Participant record ───────────────────────────────────────────────────
    if (!existingParticipant) {
      liveSession.participants.push({
        studentId: req.user.id,
        role: isHost ? "host" : "audience",
        isMuted,
        isHandRaised: false,
        lastJoinTime: new Date(),
        videoOn: isHost,
      });
    } else {
      existingParticipant.lastJoinTime = new Date();
      existingParticipant.leftAt = null;

      if (isHost) {
        existingParticipant.role = "host";
        existingParticipant.isMuted = false;
        existingParticipant.videoOn = true;

        // System message when teacher rejoins
        if (req.user.role === "teacher") {
          const teacher = await User.findById(req.user.id);
          liveSession.chatMessages.push({
            userId: req.user.id,
            userName: teacher.name,
            message: `${teacher.name} rejoined the session`,
            messageType: "system",
          });
        }
      }
    }

    await liveSession.save();

    const token = generateAgoraToken(liveSession.channelName, 0, agoraRole);

    res.json({
      message: `${req.user.role.charAt(0).toUpperCase() + req.user.role.slice(1)} joined live class successfully`,
      session: {
        id: liveSession._id,
        channelName: liveSession.channelName,
        title: liveSession.sessionTitle,
        teacherName: liveSession.teacherId.name,
        className: liveSession.classId.title,
        classDescription: liveSession.classId.description,
        isHost,
        settings: liveSession.settings,
      },
      participantInfo: {
        isMuted,
        role: isHost ? "host" : "audience",
        videoOn: isHost,
        // Tell the frontend which Agora client role to set
        clientRole: isHost ? "host" : "audience",
      },
      token,
      appId: process.env.VITE_AGORA_APP_ID,
      accessType: "free",
    });

  } catch (error) {
    console.error("❌ Error joining live class:", error.message);
    res.status(500).json({ message: "Failed to join live class", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Promote student to speaker (Teacher only)
//    Emits a socket event so the student's client can switch to host role
//    and create/publish a mic track — consuming minutes only while speaking
// ─────────────────────────────────────────────
router.post("/promote/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { studentId } = req.body;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can promote students" });
    }

    const participant = liveSession.participants.find(
      (p) => p.studentId.toString() === studentId
    );
    if (!participant) return res.status(404).json({ message: "Student not in session" });

    participant.isMuted = false;
    participant.hasSpeakingPermission = true;

    const student = await User.findById(studentId);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: student.name,
      message: `${student.name} was given permission to speak`,
      messageType: "permission_granted",
    });

    await liveSession.save();

    // Generate a short-lived PUBLISHER token for the promoted student
    const speakerToken = generateAgoraToken(liveSession.channelName, 0, RtcRole.PUBLISHER);

    // Emit via socket so the student's client switches role immediately
    const io = req.app.get("io");
    if (io) {
      io.to(sessionId).emit("student-promoted", {
        studentId,
        speakerToken,
        channelName: liveSession.channelName,
      });
    }

    res.json({ message: "Student promoted to speaker", speakerToken });

  } catch (error) {
    console.error("Error promoting student:", error);
    res.status(500).json({ message: "Failed to promote student", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Demote student back to audience (Teacher only)
// ─────────────────────────────────────────────
router.post("/demote/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { studentId } = req.body;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can demote students" });
    }

    const participant = liveSession.participants.find(
      (p) => p.studentId.toString() === studentId
    );
    if (!participant) return res.status(404).json({ message: "Student not in session" });

    participant.isMuted = true;
    participant.hasSpeakingPermission = false;
    participant.isHandRaised = false;

    await liveSession.save();

    // Tell the student's client to switch back to audience role
    const io = req.app.get("io");
    if (io) {
      io.to(sessionId).emit("student-demoted", { studentId });
    }

    res.json({ message: "Student returned to audience" });

  } catch (error) {
    console.error("Error demoting student:", error);
    res.status(500).json({ message: "Failed to demote student", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Toggle Video On/Off (host only — students are audience, no video)
// ─────────────────────────────────────────────
router.put("/video/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { videoOn } = req.body;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    const participantIndex = liveSession.participants.findIndex(
      (p) => p.studentId.toString() === req.user.id
    );
    if (participantIndex === -1) return res.status(404).json({ message: "You are not in this session" });

    liveSession.participants[participantIndex].videoOn = videoOn;
    await liveSession.save();

    res.json({ message: `Video ${videoOn ? "enabled" : "disabled"} successfully`, videoOn });

  } catch (error) {
    console.error("Error toggling video:", error);
    res.status(500).json({ message: "Failed to toggle video", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Self-Mute — audience members can always mute themselves
// ─────────────────────────────────────────────
router.put("/self-mute/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    const participantIndex = liveSession.participants.findIndex(
      (p) => p.studentId.toString() === req.user.id
    );
    if (participantIndex === -1) return res.status(404).json({ message: "You are not in this live session" });

    liveSession.participants[participantIndex].isMuted = true;
    await liveSession.save();

    return res.json({ message: "Self-muted successfully", isMuted: true });
  } catch (error) {
    console.error("Error self-muting:", error);
    return res.status(500).json({ message: "Failed to self-mute", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Self-Unmute — only allowed if student has speaking permission
//    (i.e. teacher has promoted them via /promote)
// ─────────────────────────────────────────────
router.put("/self-unmute/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    const participantIndex = liveSession.participants.findIndex(
      (p) => p.studentId.toString() === req.user.id
    );
    if (participantIndex === -1) return res.status(404).json({ message: "You are not in this live session" });

    const participant = liveSession.participants[participantIndex];

    // Teachers/admins can always unmute themselves
    const isHost =
      req.user.role === "admin" ||
      liveSession.teacherId.toString() === req.user.id;

    if (!isHost && !participant.hasSpeakingPermission) {
      return res.status(403).json({
        message: "You need speaking permission from the teacher first",
      });
    }

    participant.isMuted = false;
    await liveSession.save();

    res.json({ message: "Self-unmuted successfully", isMuted: false });

  } catch (error) {
    console.error("Error self-unmuting:", error);
    res.status(500).json({ message: "Failed to self-unmute", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Update Session Settings (Teacher only)
// ─────────────────────────────────────────────
router.put("/settings/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { autoMuteNewStudents } = req.body;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can update session settings" });
    }

    if (typeof autoMuteNewStudents === "boolean") {
      liveSession.settings.autoMuteNewStudents = autoMuteNewStudents;
    }

    await liveSession.save();
    res.json({ message: "Session settings updated successfully", settings: liveSession.settings });

  } catch (error) {
    console.error("Error updating session settings:", error);
    res.status(500).json({ message: "Failed to update session settings", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Get Session Info
// ─────────────────────────────────────────────
router.get("/session/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const liveSession = await LiveSession.findById(sessionId)
      .populate("classId", "title description")
      .populate("teacherId", "name")
      .populate("participants.studentId", "name role")
      .populate("chatMessages.userId", "name");

    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    const isUserTeacher = liveSession.teacherId._id.toString() === req.user.id;
    const isUserAdmin = req.user.role === "admin";

    const totalMessages = liveSession.chatMessages.length;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;

    const paginatedMessages = liveSession.chatMessages
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(startIndex, endIndex);

    res.json({
      session: {
        _id: liveSession._id,
        classId: liveSession.classId,
        teacherId: liveSession.teacherId,
        channelName: liveSession.channelName,
        sessionTitle: liveSession.sessionTitle,
        isActive: liveSession.isActive !== undefined ? liveSession.isActive : true,
        startTime: liveSession.startTime,
        endTime: liveSession.endTime,
        settings: liveSession.settings,
        recording: liveSession.recording,
      },
      participants: liveSession.participants.map((p) => ({
        studentId: p.studentId._id,
        name: p.studentId.name,
        role: p.studentId.role,
        sessionRole: p.role, // "host" or "audience"
        isHandRaised: p.isHandRaised,
        isMuted: p.isMuted,
        videoOn: p.videoOn,
        hasSpeakingPermission: p.hasSpeakingPermission,
        totalTimeSpent: p.totalTimeSpent,
        lastJoinTime: p.lastJoinTime,
        joinedAt: p.joinedAt,
        isScreenSharing: p.isScreenSharing,
      })),
      chatMessages: paginatedMessages.map((m) => ({
        userName: m.userId?.name || "System",
        message: m.message,
        timestamp: m.timestamp,
        messageType: m.messageType,
        metadata: m.metadata,
      })),
      settings: liveSession.settings,
      userPermissions: {
        isTeacher: isUserTeacher,
        isAdmin: isUserAdmin,
        canManageSession: isUserTeacher || isUserAdmin,
        userId: req.user.id,
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalMessages / limitNum),
        totalMessages,
        hasNext: endIndex < totalMessages,
        hasPrev: startIndex > 0,
        limit: limitNum,
      },
    });

  } catch (error) {
    console.error("❌ Error fetching session info:", error);
    res.status(500).json({ message: "Failed to fetch session info", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Raise / Lower Hand
// ─────────────────────────────────────────────
router.put("/hand/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { action } = req.body;

    if (!["raise", "lower"].includes(action)) {
      return res.status(400).json({ message: "Action must be 'raise' or 'lower'" });
    }

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    const participantIndex = liveSession.participants.findIndex(
      (p) => p.studentId.toString() === req.user.id
    );
    if (participantIndex === -1) return res.status(404).json({ message: "You are not in this live session" });

    liveSession.participants[participantIndex].isHandRaised = action === "raise";

    const user = await User.findById(req.user.id);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: user.name,
      message: `${user.name} ${action === "raise" ? "raised hand" : "lowered hand"}`,
      messageType: "system",
    });

    await liveSession.save();

    // Notify teacher via socket so they see the hand raise instantly
    const io = req.app.get("io");
    if (io && action === "raise") {
      io.to(sessionId).emit("hand-raised", {
        studentId: req.user.id,
        studentName: user.name,
      });
    }

    res.json({ message: `Hand ${action}ed successfully`, isHandRaised: action === "raise" });

  } catch (error) {
    console.error("Error updating hand status:", error);
    res.status(500).json({ message: "Failed to update hand status", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Send Chat Message
// ─────────────────────────────────────────────
router.post("/chat/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({ message: "Message cannot be empty" });
    }

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    const user = await User.findById(req.user.id);

    const chatMsg = {
      userId: req.user.id,
      userName: user.name,
      message: message.trim(),
      messageType: "text",
      timestamp: new Date(),
    };

    liveSession.chatMessages.push(chatMsg);
    await liveSession.save();

    // Broadcast via socket so all clients get it instantly without polling
    const io = req.app.get("io");
    if (io) {
      io.to(sessionId).emit("new-chat-message", {
        userName: user.name,
        message: message.trim(),
        timestamp: chatMsg.timestamp,
        messageType: "text",
      });
    }

    res.json({
      message: "Chat message sent successfully",
      chatMessage: { userName: user.name, message: message.trim(), timestamp: chatMsg.timestamp, messageType: "text" },
    });

  } catch (error) {
    console.error("Error sending chat message:", error);
    res.status(500).json({ message: "Failed to send chat message", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 End Live Class (Teacher only)
// ─────────────────────────────────────────────
router.put("/end/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can end the live class" });
    }

    liveSession.isActive = false;
    liveSession.endTime = new Date();
    await liveSession.save();

    const io = req.app.get("io");
    if (io) {
      io.to(sessionId).emit("session-ended", {
        message: "Lesson has ended by teacher",
        sessionId,
        endedBy: req.user.id,
        timestamp: new Date(),
      });
    }

    res.json({ message: "Live class ended successfully", sessionId: liveSession._id });

  } catch (error) {
    console.error("Error ending live class:", error);
    res.status(500).json({ message: "Failed to end live class", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Leave Live Class
// ─────────────────────────────────────────────
router.put("/leave/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    const participantIndex = liveSession.participants.findIndex(
      (p) => p.studentId.toString() === req.user.id && !p.leftAt
    );

    if (participantIndex !== -1) {
      const participant = liveSession.participants[participantIndex];
      const now = new Date();
      participant.leftAt = now;

      if (participant.lastJoinTime) {
        participant.totalTimeSpent += now - participant.lastJoinTime;
        participant.lastJoinTime = null;
      }

      // Reset speaking permission on leave
      participant.hasSpeakingPermission = false;
      participant.isMuted = true;

      await liveSession.save();
    }

    res.json({ message: "Left live class successfully" });

  } catch (error) {
    console.error("Error leaving live class:", error);
    res.status(500).json({ message: "Failed to leave live class", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Start Screen Sharing (Teacher only)
// ─────────────────────────────────────────────
router.post("/screen-share/start/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can start screen sharing" });
    }

    const idx = liveSession.participants.findIndex((p) => p.studentId.toString() === req.user.id);
    if (idx === -1) return res.status(404).json({ message: "Teacher not found in session" });

    liveSession.participants[idx].isScreenSharing = true;

    const teacher = await User.findById(req.user.id);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: teacher.name,
      message: `${teacher.name} started screen sharing`,
      messageType: "system",
      metadata: { action: "screen_share_started" },
    });

    await liveSession.save();
    res.json({ message: "Screen sharing started", isScreenSharing: true });

  } catch (error) {
    console.error("Error starting screen sharing:", error);
    res.status(500).json({ message: "Failed to start screen sharing", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Stop Screen Sharing (Teacher only)
// ─────────────────────────────────────────────
router.post("/screen-share/stop/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can stop screen sharing" });
    }

    const idx = liveSession.participants.findIndex((p) => p.studentId.toString() === req.user.id);
    if (idx === -1) return res.status(404).json({ message: "Teacher not found in session" });

    liveSession.participants[idx].isScreenSharing = false;

    const teacher = await User.findById(req.user.id);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: teacher.name,
      message: `${teacher.name} stopped screen sharing`,
      messageType: "system",
      metadata: { action: "screen_share_stopped" },
    });

    await liveSession.save();
    res.json({ message: "Screen sharing stopped", isScreenSharing: false });

  } catch (error) {
    console.error("Error stopping screen sharing:", error);
    res.status(500).json({ message: "Failed to stop screen sharing", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Start Recording (Teacher only)
// ─────────────────────────────────────────────
router.post("/recording/start/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can start recording" });
    }

    if (liveSession.recording.isRecording) {
      return res.status(400).json({ message: "Recording is already in progress" });
    }

    const resourceId = `rec_${sessionId}_${Date.now()}`;
    const sid = `sid_${sessionId}_${Date.now()}`;

    liveSession.recording = { isRecording: true, startTime: new Date(), resourceId, sid };

    const teacher = await User.findById(req.user.id);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: teacher.name,
      message: `${teacher.name} started recording the session`,
      messageType: "system",
      metadata: { action: "recording_started" },
    });

    await liveSession.save();

    res.json({
      message: "Recording started successfully",
      recording: { isRecording: true, startTime: liveSession.recording.startTime, resourceId, sid },
    });

  } catch (error) {
    console.error("Error starting recording:", error);
    res.status(500).json({ message: "Failed to start recording", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Stop Recording (Teacher only)
// ─────────────────────────────────────────────
router.post("/recording/stop/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can stop recording" });
    }

    if (!liveSession.recording.isRecording) {
      return res.status(400).json({ message: "No recording in progress" });
    }

    liveSession.recording.isRecording = false;
    liveSession.recording.endTime = new Date();
    liveSession.recording.recordingUrl = `https://your-storage-bucket.com/recordings/${sessionId}_${Date.now()}.mp4`;
    liveSession.recording.fileList = [{
      fileName: `recording_${sessionId}_${Date.now()}.mp4`,
      trackType: "audio_and_video",
      uid: "mixed",
      mixedAllUser: true,
      startTime: liveSession.recording.startTime,
      endTime: new Date(),
    }];

    const teacher = await User.findById(req.user.id);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: teacher.name,
      message: `${teacher.name} stopped recording the session`,
      messageType: "system",
      metadata: { action: "recording_stopped" },
    });

    await liveSession.save();

    res.json({
      message: "Recording stopped successfully",
      recording: {
        isRecording: false,
        startTime: liveSession.recording.startTime,
        endTime: liveSession.recording.endTime,
        recordingUrl: liveSession.recording.recordingUrl,
        duration: Math.round((liveSession.recording.endTime - liveSession.recording.startTime) / 1000 / 60),
      },
    });

  } catch (error) {
    console.error("Error stopping recording:", error);
    res.status(500).json({ message: "Failed to stop recording", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Get Recording Status
// ─────────────────────────────────────────────
router.get("/recording/status/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });
    res.json({ recording: liveSession.recording });
  } catch (error) {
    console.error("Error fetching recording status:", error);
    res.status(500).json({ message: "Failed to fetch recording status", error: error.message });
  }
});

// ─────────────────────────────────────────────
// 🔹 Get Session Recordings
// ─────────────────────────────────────────────
router.get("/recordings/:classId", verifyToken, async (req, res) => {
  try {
    const { classId } = req.params;
    const sessionsWithRecordings = await LiveSession.find({
      classId,
      "recording.recordingUrl": { $exists: true, $ne: null },
    })
      .select("sessionTitle startTime endTime recording")
      .sort({ startTime: -1 });

    res.json({
      recordings: sessionsWithRecordings.map((session) => ({
        sessionId: session._id,
        sessionTitle: session.sessionTitle,
        startTime: session.startTime,
        endTime: session.endTime,
        recording: session.recording,
      })),
    });

  } catch (error) {
    console.error("Error fetching recordings:", error);
    res.status(500).json({ message: "Failed to fetch recordings", error: error.message });
  }
});

export default router;