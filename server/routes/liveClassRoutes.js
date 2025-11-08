import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import LiveSession from "../models/LiveSession.js";
import ClassSchedule from "../models/ClassSchedule.js";
import User from "../models/User.js";
import { generateAgoraToken } from "../utils/agoraTokenGenerator.js";
import agoraToken from "agora-token";

// FIX: Define RtcRole directly from agora-token package
const RtcRole = agoraToken.RtcRole;

const router = express.Router();

// 🔹 Start a live class (Teacher only)
router.post("/start", verifyToken, async (req, res) => {
  try {
    const { classId } = req.body;
    
    // Check if user is a teacher
    if (req.user.role !== "teacher") {
      return res.status(403).json({ message: "Only teachers can start live classes" });
    }

    // Find the class schedule
    const classSchedule = await ClassSchedule.findById(classId);
    if (!classSchedule) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Check if teacher owns this class
    if (classSchedule.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: "You can only start your own classes" });
    }

    // Generate unique channel name
    const channelName = `class_${classId}_${Date.now()}`;

    // Check if there's already an active session for this class
    const existingSession = await LiveSession.findOne({ 
      classId, 
      isActive: true 
    });

    if (existingSession) {
      return res.status(400).json({ 
        message: "A live session is already active for this class",
        sessionId: existingSession._id 
      });
    }

    // Create new live session with enhanced settings
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
        videoOn: false,
        lastJoinTime: new Date()
      }],
      settings: {
        autoMuteNewStudents: true // All new students join muted
      }
    });

    await liveSession.save();

    // Generate Agora token for teacher (host)
    const token = generateAgoraToken(channelName, 0, RtcRole.PUBLISHER);

    console.log("✅ Live class started - Token generated:", token ? "YES" : "NO");

    res.status(201).json({
      message: "Live class started successfully",
      sessionId: liveSession._id,
      channelName,
      token,
      appId: process.env.VITE_AGORA_APP_ID
    });

  } catch (error) {
    console.error("Error starting live class:", error);
    res.status(500).json({ message: "Failed to start live class", error: error.message });
  }
});

// 🔹 Check if teacher can rejoin their live session
router.get("/teacher-session/:classId", verifyToken, async (req, res) => {
  try {
    const { classId } = req.params;

    // Check if user is a teacher
    if (req.user.role !== "teacher") {
      return res.status(403).json({ message: "Only teachers can check their sessions" });
    }

    // Find active session for this class owned by the teacher
    const activeSession = await LiveSession.findOne({
      classId,
      teacherId: req.user.id,
      isActive: true
    })
    .populate("classId", "title description")
    .populate("teacherId", "name");

    if (!activeSession) {
      return res.status(404).json({ 
        message: "No active session found for this class",
        hasActiveSession: false
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
        allowTeacherRejoin: activeSession.allowTeacherRejoin
      }
    });

  } catch (error) {
    console.error("Error checking teacher session:", error);
    res.status(500).json({ message: "Failed to check teacher session", error: error.message });
  }
});

// 🔹 Join a live class (Student/Teacher/Admin) - FIXED: Ensure proper initial audio state
router.post("/join/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log("🔹 JOIN ATTEMPT - User Info:", {
      userId: req.user.id,
      userRole: req.user.role,
      userEmail: req.user.email,
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });

    // ✅ ADD THIS DEBUG TO VERIFY ADMIN DATA
    if (req.user.role === "admin") {
      console.log("🎯 ADMIN JOIN - Database User:", {
        id: req.user.id,
        email: req.user.email, 
        name: req.user.name,
        role: req.user.role
      });
    }

    // ✅ ADD THIS DEBUG TO SEE IF ADMIN REACHES HERE
    if (req.user.role === "admin") {
      console.log("🎯 ADMIN JOIN REACHED BACKEND - Token verification passed!");
    }

    // ✅ CRITICAL FIX: Handle admin with null userId in localStorage
    if (req.user.role === "admin") {
      console.log("🛠️ ADMIN JOIN DETECTED - User ID from token:", req.user.id);
      
      // Find admin user to get complete info
      const adminUser = await User.findById(req.user.id);
      if (!adminUser) {
        return res.status(404).json({ message: "Admin user not found in database" });
      }
      
      console.log("✅ Admin verified in database:", {
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role
      });
    }

    // Find the live session
    const liveSession = await LiveSession.findById(sessionId)
      .populate("classId", "title description")
      .populate("teacherId", "name");

    if (!liveSession) {
      console.log("❌ Live session not found:", sessionId);
      return res.status(404).json({ message: "Live session not found" });
    }

    if (!liveSession.isActive) {
      console.log(`❌ Session ${sessionId} is not active. isActive: ${liveSession.isActive}`);
      return res.status(400).json({ 
        message: "This live session has ended",
        details: {
          isActive: liveSession.isActive,
          endTime: liveSession.endTime,
          sessionId: liveSession._id
        }
      });
    }

    console.log("✅ Session found and active:", {
      sessionTitle: liveSession.sessionTitle,
      teacherId: liveSession.teacherId._id.toString(),
      teacherName: liveSession.teacherId.name,
      channelName: liveSession.channelName
    });

    // Check if user is already a participant
    const existingParticipant = liveSession.participants.find(
      p => p.studentId.toString() === req.user.id
    );

    let role = RtcRole.SUBSCRIBER;
    let isMuted = liveSession.settings.autoMuteNewStudents;

    // ✅ FIXED: PROPER INITIAL STATE HANDLING
    if (req.user.role === "admin") {
      role = RtcRole.PUBLISHER;
      isMuted = false;
      console.log("🔧 ADMIN joining with FULL HOST privileges");
    }
    // Teacher joins as host
    else if (req.user.role === "teacher" && liveSession.teacherId._id.toString() === req.user.id) {
      role = RtcRole.PUBLISHER;
      isMuted = false;
      console.log("👨‍🏫 Teacher joining with host privileges");
      
      // Reset leftAt time when teacher rejoins
      if (existingParticipant && existingParticipant.leftAt) {
        existingParticipant.leftAt = null;
        existingParticipant.lastJoinTime = new Date();
        
        // Add system message for teacher rejoin
        const teacher = await User.findById(req.user.id);
        liveSession.chatMessages.push({
          userId: req.user.id,
          userName: teacher.name,
          message: `${teacher.name} rejoined the session`,
          messageType: "system"
        });
      }
    } else {
      // ✅ CRITICAL FIX: Students join muted but CAN SELF-UNMUTE WITHOUT PERMISSION
      isMuted = true; // Students always join muted
      console.log("🎓 Student joining muted but can self-unmute freely");
    }

    // Add user to participants if not already added
    if (!existingParticipant) {
      const newParticipant = {
        studentId: req.user.id,
        role: req.user.role === "teacher" || req.user.role === "admin" ? "host" : "audience",
        isMuted,
        isHandRaised: false,
        lastJoinTime: new Date(),
        videoOn: req.user.role === "admin" ? true : false
      };
      
      liveSession.participants.push(newParticipant);
      console.log("✅ Added new participant:", {
        userId: req.user.id,
        role: newParticipant.role,
        isMuted: newParticipant.isMuted
      });
    } else {
      existingParticipant.lastJoinTime = new Date();
      // ✅ FIXED: Admin role update without permission
      if (req.user.role === "admin") {
        existingParticipant.role = "host";
        existingParticipant.isMuted = false;
        existingParticipant.videoOn = true;
        console.log("✅ Updated existing admin participant with HOST privileges");
      }
      console.log("✅ Updated existing participant:", {
        userId: req.user.id,
        role: existingParticipant.role,
        isMuted: existingParticipant.isMuted
      });
    }

    await liveSession.save();

    // Generate Agora token
    const token = generateAgoraToken(liveSession.channelName, 0, role);

    console.log(`✅ ${req.user.role.toUpperCase()} joined live class successfully - Token generated:`, token ? "YES" : "NO");

    // Prepare response data
    const responseData = {
      message: `${req.user.role.charAt(0).toUpperCase() + req.user.role.slice(1)} joined live class successfully`,
      session: {
        id: liveSession._id,
        channelName: liveSession.channelName,
        title: liveSession.sessionTitle,
        teacherName: liveSession.teacherId.name,
        className: liveSession.classId.title,
        classDescription: liveSession.classId.description,
        isHost: role === RtcRole.PUBLISHER,
        settings: liveSession.settings
      },
      participantInfo: {
        isMuted,
        role: req.user.role === "teacher" || req.user.role === "admin" ? "host" : "audience",
        videoOn: req.user.role === "admin" ? true : false
      },
      token,
      appId: process.env.VITE_AGORA_APP_ID,
      accessType: "free"
    };

    console.log("📤 Sending join response:", {
      userId: req.user.id,
      userRole: req.user.role,
      isHost: responseData.session.isHost,
      isMuted: responseData.participantInfo.isMuted
    });

    res.json(responseData);

  } catch (error) {
    console.error("❌ Error joining live class:", {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      userRole: req.user?.role,
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      message: "Failed to join live class", 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 🔹 Toggle Video On/Off
router.put("/video/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { videoOn } = req.body; // true or false

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Find participant
    const participantIndex = liveSession.participants.findIndex(
      p => p.studentId.toString() === req.user.id
    );

    if (participantIndex === -1) {
      return res.status(404).json({ message: "You are not in this session" });
    }

    liveSession.participants[participantIndex].videoOn = videoOn;

    // Add system message
    const user = await User.findById(req.user.id);
    const actionText = videoOn ? "turned ON video" : "turned OFF video";
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: user.name,
      message: `${user.name} ${actionText}`,
      messageType: "system"
    });

    await liveSession.save();

    res.json({
      message: `Video ${videoOn ? "enabled" : "disabled"} successfully`,
      videoOn
    });

  } catch (error) {
    console.error("Error toggling video:", error);
    res.status(500).json({ message: "Failed to toggle video", error: error.message });
  }
});

// ✅ KEEP THESE - Students control their own audio

// 🔹 Self-Mute (Student) — allow always (SIMPLIFIED)
router.put("/self-mute/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: "Live session not found" });

    const participantIndex = liveSession.participants.findIndex(
      p => p.studentId.toString() === req.user.id
    );
    if (participantIndex === -1) return res.status(404).json({ message: "You are not in this live session" });

    // ✅ ALLOW student to mute themselves anytime
    liveSession.participants[participantIndex].isMuted = true;
    await liveSession.save();

    return res.json({ message: "Self-muted successfully", isMuted: true });
  } catch (error) {
    console.error("Error self-muting:", error);
    return res.status(500).json({ message: "Failed to self-mute", error: error.message });
  }
});

// 🔹 Self-Unmute (Student) — allow always WITHOUT PERMISSION
router.put("/self-unmute/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Find participant
    const participantIndex = liveSession.participants.findIndex(
      p => p.studentId.toString() === req.user.id
    );

    if (participantIndex === -1) {
      return res.status(404).json({ message: "You are not in this live session" });
    }

    // ✅ ALLOW self-unmute without permission check
    liveSession.participants[participantIndex].isMuted = false;

    await liveSession.save();

    res.json({
      message: "Self-unmuted successfully",
      isMuted: false
    });

  } catch (error) {
    console.error("Error self-unmuting:", error);
    res.status(500).json({ message: "Failed to self-unmute", error: error.message });
  }
});

// 🔹 Update Session Settings (Teacher only)
router.put("/settings/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { autoMuteNewStudents } = req.body;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Check if user is teacher and owns the session
    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can update session settings" });
    }

    // Update settings
    if (typeof autoMuteNewStudents === 'boolean') {
      liveSession.settings.autoMuteNewStudents = autoMuteNewStudents;
    }

    await liveSession.save();

    res.json({
      message: "Session settings updated successfully",
      settings: liveSession.settings
    });

  } catch (error) {
    console.error("Error updating session settings:", error);
    res.status(500).json({ message: "Failed to update session settings", error: error.message });
  }
});

// 🔹 Enhanced Get Session Info - UPDATED: Remove permission data
router.get("/session/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    console.log("🔍 DEBUG: Fetching session info for:", sessionId);
    console.log("🔍 DEBUG: Request user ID:", req.user.id);
    console.log("🔍 DEBUG: Request user role:", req.user.role);
    console.log("🔍 DEBUG: Pagination params - page:", page, "limit:", limit);

    const liveSession = await LiveSession.findById(sessionId)
      .populate("classId", "title description")
      .populate("teacherId", "name")
      .populate("participants.studentId", "name role")
      .populate("chatMessages.userId", "name");

    if (!liveSession) {
      console.log("❌ Session not found:", sessionId);
      return res.status(404).json({ message: "Live session not found" });
    }

    console.log("🔍 DEBUG: Session found - isActive:", liveSession.isActive);
    console.log("🔍 DEBUG: Teacher ID:", liveSession.teacherId._id.toString());
    console.log("🔍 DEBUG: Request user ID:", req.user.id);
    console.log("🔍 DEBUG: Is user teacher?", liveSession.teacherId._id.toString() === req.user.id);

    // Check if current user is the teacher
    const isUserTeacher = liveSession.teacherId._id.toString() === req.user.id;
    const isUserAdmin = req.user.role === "admin";

    console.log("🔍 DEBUG: User is teacher:", isUserTeacher);
    console.log("🔍 DEBUG: User is admin:", isUserAdmin);

    // Calculate pagination for chat messages
    const totalMessages = liveSession.chatMessages.length;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;
    
    // Sort messages by timestamp (newest first) and paginate
    const paginatedMessages = liveSession.chatMessages
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(startIndex, endIndex);

    console.log("🔍 DEBUG: Chat pagination -", {
      totalMessages,
      page: pageNum,
      limit: limitNum,
      startIndex,
      endIndex,
      returnedMessages: paginatedMessages.length
    });

    // ✅ FIXED: Ensure isActive is properly set in response
    const responseData = {
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
        recording: liveSession.recording
      },
      participants: liveSession.participants.map(p => ({
        studentId: p.studentId._id,
        name: p.studentId.name,
        role: p.studentId.role,
        isHandRaised: p.isHandRaised,
        isMuted: p.isMuted,
        videoOn: p.videoOn,
        totalTimeSpent: p.totalTimeSpent,
        lastJoinTime: p.lastJoinTime,
        joinedAt: p.joinedAt,
        isScreenSharing: p.isScreenSharing
      })),
      chatMessages: paginatedMessages.map(m => ({
        userName: m.userId?.name || "System",
        message: m.message,
        timestamp: m.timestamp,
        messageType: m.messageType,
        metadata: m.metadata
      })),
      settings: liveSession.settings,
      userPermissions: {
        isTeacher: isUserTeacher,
        isAdmin: isUserAdmin,
        canManageSession: isUserTeacher || isUserAdmin,
        userId: req.user.id
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalMessages / limitNum),
        totalMessages,
        hasNext: endIndex < totalMessages,
        hasPrev: startIndex > 0,
        limit: limitNum
      }
    };

    console.log("🔍 DEBUG: Sending response with", responseData.chatMessages.length, "chat messages");
    console.log("🔍 DEBUG: First chat message:", responseData.chatMessages[0]);
    console.log("🔍 DEBUG: Session isActive in response:", responseData.session.isActive);
    console.log("🔍 DEBUG: Pagination info:", responseData.pagination);

    res.json(responseData);

  } catch (error) {
    console.error("❌ Error fetching session info:", error);
    res.status(500).json({ message: "Failed to fetch session info", error: error.message });
  }
});

// 🔹 Enhanced Raise/Lower Hand (Student) - UPDATED: Remove auto permission request
router.put("/hand/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { action } = req.body; // "raise" or "lower"

    if (!["raise", "lower"].includes(action)) {
      return res.status(400).json({ message: "Action must be 'raise' or 'lower'" });
    }

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Find participant
    const participantIndex = liveSession.participants.findIndex(
      p => p.studentId.toString() === req.user.id
    );

    if (participantIndex === -1) {
      return res.status(404).json({ message: "You are not in this live session" });
    }

    // Update hand raise status
    liveSession.participants[participantIndex].isHandRaised = action === "raise";

    // Add system message for hand raise/lower
    const user = await User.findById(req.user.id);
    const actionText = action === "raise" ? "raised hand" : "lowered hand";
    
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: user.name,
      message: `${user.name} ${actionText}`,
      messageType: "system"
    });

    await liveSession.save();

    res.json({
      message: `Hand ${action}ed successfully`,
      isHandRaised: action === "raise"
    });

  } catch (error) {
    console.error("Error updating hand status:", error);
    res.status(500).json({ message: "Failed to update hand status", error: error.message });
  }
});

// 🔹 Send Chat Message
router.post("/chat/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({ message: "Message cannot be empty" });
    }

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    const user = await User.findById(req.user.id);

    // Add chat message
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: user.name,
      message: message.trim(),
      messageType: "text"
    });

    await liveSession.save();

    res.json({
      message: "Chat message sent successfully",
      chatMessage: {
        userName: user.name,
        message: message.trim(),
        timestamp: new Date(),
        messageType: "text"
      }
    });

  } catch (error) {
    console.error("Error sending chat message:", error);
    res.status(500).json({ message: "Failed to send chat message", error: error.message });
  }
});

// 🔹 End Live Class (Teacher only)
router.put("/end/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can end the live class" });
    }

    liveSession.isActive = false;
    liveSession.endTime = new Date();
    await liveSession.save();

    res.json({
      message: "Live class ended successfully",
      sessionId: liveSession._id
    });

  } catch (error) {
    console.error("Error ending live class:", error);
    res.status(500).json({ message: "Failed to end live class", error: error.message });
  }
});

// 🔹 Leave Live Class
router.put("/leave/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Update participant's leftAt time and calculate duration
    const participantIndex = liveSession.participants.findIndex(
      p => p.studentId.toString() === req.user.id && !p.leftAt
    );

    if (participantIndex !== -1) {
      const participant = liveSession.participants[participantIndex];
      const now = new Date();

      participant.leftAt = now;

      // Calculate duration
      if (participant.lastJoinTime) {
        const duration = now - participant.lastJoinTime;
        participant.totalTimeSpent += duration;
        participant.lastJoinTime = null;
      }

      await liveSession.save();
    }

    res.json({ message: "Left live class successfully" });

  } catch (error) {
    console.error("Error leaving live class:", error);
    res.status(500).json({ message: "Failed to leave live class", error: error.message });
  }
});

// 🔹 Start Screen Sharing (Teacher only)
router.post("/screen-share/start/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Check if user is teacher and owns the session
    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can start screen sharing" });
    }

    // Find teacher participant
    const teacherParticipantIndex = liveSession.participants.findIndex(
      p => p.studentId.toString() === req.user.id
    );

    if (teacherParticipantIndex === -1) {
      return res.status(404).json({ message: "Teacher not found in session" });
    }

    // Update screen sharing status
    liveSession.participants[teacherParticipantIndex].isScreenSharing = true;

    // Add system message
    const teacher = await User.findById(req.user.id);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: teacher.name,
      message: `${teacher.name} started screen sharing`,
      messageType: "system",
      metadata: {
        action: "screen_share_started"
      }
    });

    await liveSession.save();

    res.json({
      message: "Screen sharing started",
      isScreenSharing: true
    });

  } catch (error) {
    console.error("Error starting screen sharing:", error);
    res.status(500).json({ message: "Failed to start screen sharing", error: error.message });
  }
});

// 🔹 Stop Screen Sharing (Teacher only)
router.post("/screen-share/stop/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Check if user is teacher and owns the session
    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can stop screen sharing" });
    }

    // Find teacher participant
    const teacherParticipantIndex = liveSession.participants.findIndex(
      p => p.studentId.toString() === req.user.id
    );

    if (teacherParticipantIndex === -1) {
      return res.status(404).json({ message: "Teacher not found in session" });
    }

    // Update screen sharing status
    liveSession.participants[teacherParticipantIndex].isScreenSharing = false;

    // Add system message
    const teacher = await User.findById(req.user.id);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: teacher.name,
      message: `${teacher.name} stopped screen sharing`,
      messageType: "system",
      metadata: {
        action: "screen_share_stopped"
      }
    });

    await liveSession.save();

    res.json({
      message: "Screen sharing stopped",
      isScreenSharing: false
    });

  } catch (error) {
    console.error("Error stopping screen sharing:", error);
    res.status(500).json({ message: "Failed to stop screen sharing", error: error.message });
  }
});

// 🔹 Start Recording (Teacher only)
router.post("/recording/start/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Check if user is teacher and owns the session
    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can start recording" });
    }

    // Check if already recording
    if (liveSession.recording.isRecording) {
      return res.status(400).json({ message: "Recording is already in progress" });
    }

    // Generate unique resource ID and SID for recording
    const resourceId = `rec_${sessionId}_${Date.now()}`;
    const sid = `sid_${sessionId}_${Date.now()}`;

    // Update session with recording info
    liveSession.recording = {
      isRecording: true,
      startTime: new Date(),
      resourceId,
      sid
    };

    // Add system message
    const teacher = await User.findById(req.user.id);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: teacher.name,
      message: `${teacher.name} started recording the session`,
      messageType: "system",
      metadata: {
        action: "recording_started"
      }
    });

    await liveSession.save();

    // In a real implementation, you would call Agora Cloud Recording API here
    console.log(`🎥 Recording started for session ${sessionId}`);

    res.json({
      message: "Recording started successfully",
      recording: {
        isRecording: true,
        startTime: liveSession.recording.startTime,
        resourceId,
        sid
      }
    });

  } catch (error) {
    console.error("Error starting recording:", error);
    res.status(500).json({ message: "Failed to start recording", error: error.message });
  }
});

// 🔹 Stop Recording (Teacher only)
router.post("/recording/stop/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Check if user is teacher and owns the session
    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can stop recording" });
    }

    // Check if recording is in progress
    if (!liveSession.recording.isRecording) {
      return res.status(400).json({ message: "No recording in progress" });
    }

    // Update recording info
    liveSession.recording.isRecording = false;
    liveSession.recording.endTime = new Date();
    
    // Generate mock recording URL (in real implementation, this comes from Agora)
    liveSession.recording.recordingUrl = `https://your-storage-bucket.com/recordings/${sessionId}_${Date.now()}.mp4`;
    
    // Mock file list
    liveSession.recording.fileList = [{
      fileName: `recording_${sessionId}_${Date.now()}.mp4`,
      trackType: "audio_and_video",
      uid: "mixed",
      mixedAllUser: true,
      startTime: liveSession.recording.startTime,
      endTime: new Date()
    }];

    // Add system message
    const teacher = await User.findById(req.user.id);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: teacher.name,
      message: `${teacher.name} stopped recording the session`,
      messageType: "system",
      metadata: {
        action: "recording_stopped"
      }
    });

    await liveSession.save();

    console.log(`🎥 Recording stopped for session ${sessionId}`);

    res.json({
      message: "Recording stopped successfully",
      recording: {
        isRecording: false,
        startTime: liveSession.recording.startTime,
        endTime: liveSession.recording.endTime,
        recordingUrl: liveSession.recording.recordingUrl,
        duration: Math.round((liveSession.recording.endTime - liveSession.recording.startTime) / 1000 / 60) // in minutes
      }
    });

  } catch (error) {
    console.error("Error stopping recording:", error);
    res.status(500).json({ message: "Failed to stop recording", error: error.message });
  }
});

// 🔹 Get Recording Status
router.get("/recording/status/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    res.json({
      recording: liveSession.recording
    });

  } catch (error) {
    console.error("Error fetching recording status:", error);
    res.status(500).json({ message: "Failed to fetch recording status", error: error.message });
  }
});

// 🔹 Get Session Recordings (For playback after class)
router.get("/recordings/:classId", verifyToken, async (req, res) => {
  try {
    const { classId } = req.params;

    // Find all sessions for this class that have recordings
    const sessionsWithRecordings = await LiveSession.find({
      classId,
      "recording.recordingUrl": { $exists: true, $ne: null }
    })
    .select("sessionTitle startTime endTime recording")
    .sort({ startTime: -1 });

    res.json({
      recordings: sessionsWithRecordings.map(session => ({
        sessionId: session._id,
        sessionTitle: session.sessionTitle,
        startTime: session.startTime,
        endTime: session.endTime,
        recording: session.recording
      }))
    });

  } catch (error) {
    console.error("Error fetching recordings:", error);
    res.status(500).json({ message: "Failed to fetch recordings", error: error.message });
  }
});

export default router;