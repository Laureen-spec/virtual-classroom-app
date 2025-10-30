import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { checkSubscription } from "../middleware/subscriptionMiddleware.js"; // NEW IMPORT
import LiveSession from "../models/LiveSession.js";
import ClassSchedule from "../models/ClassSchedule.js";
import User from "../models/User.js";
import { generateAgoraToken, RtcRole } from "../utils/agoraTokenGenerator.js";

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
        hasSpeakingPermission: true, // Teacher has speaking permission by default
        permissionRequested: false,
        videoOn: false,
        lastJoinTime: new Date()
      }],
      settings: {
        allowSelfUnmute: false, // Students cannot self-unmute without permission
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

// 🔹 Join a live class (Student/Teacher) - WITH SUBSCRIPTION CHECK
router.post("/join/:sessionId", verifyToken, checkSubscription, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Find the live session
    const liveSession = await LiveSession.findById(sessionId)
      .populate("classId", "title description")
      .populate("teacherId", "name");

    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    if (!liveSession.isActive) {
      return res.status(400).json({ message: "This live session has ended" });
    }

    // Check if user is already a participant
    const existingParticipant = liveSession.participants.find(
      p => p.studentId.toString() === req.user.id
    );

    let role = RtcRole.SUBSCRIBER;
    let isMuted = liveSession.settings.autoMuteNewStudents; // Respect auto-mute setting
    let hasSpeakingPermission = false;

    // Teacher joins as host
    if (req.user.role === "teacher" && liveSession.teacherId._id.toString() === req.user.id) {
      role = RtcRole.PUBLISHER;
      isMuted = false;
      hasSpeakingPermission = true;
    }

    // Add user to participants if not already added
    if (!existingParticipant) {
      liveSession.participants.push({
        studentId: req.user.id,
        role: req.user.role === "teacher" ? "host" : "audience",
        isMuted,
        isHandRaised: false,
        hasSpeakingPermission,
        permissionRequested: false,
        lastJoinTime: new Date()
      });
    } else {
      existingParticipant.lastJoinTime = new Date();
    }

    await liveSession.save();

    // Generate Agora token
    const token = generateAgoraToken(liveSession.channelName, 0, role);

    console.log("✅ User joined live class - Token generated:", token ? "YES" : "NO");

    // Prepare response data
    const responseData = {
      message: "Joined live class successfully",
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
        hasSpeakingPermission,
        canSelfUnmute: hasSpeakingPermission && !isMuted
      },
      token,
      appId: process.env.VITE_AGORA_APP_ID
    };

    // Add subscription info to response for students
    if (req.user.role === "student" && req.subscription) {
      responseData.subscription = {
        status: "active",
        expiryDate: req.subscription.expiryDate,
        subjects: req.subscription.subjects
      };
    }

    res.json(responseData);

  } catch (error) {
    console.error("Error joining live class:", error);
    res.status(500).json({ message: "Failed to join live class", error: error.message });
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

// 🔹 Request Speaking Permission (Student)
router.post("/request-speaking/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Check if user is a student
    if (req.user.role === "teacher") {
      return res.status(400).json({ message: "Teachers don't need to request speaking permission" });
    }

    // Find participant
    const participantIndex = liveSession.participants.findIndex(
      p => p.studentId.toString() === req.user.id
    );

    if (participantIndex === -1) {
      return res.status(404).json({ message: "You are not in this live session" });
    }

    const participant = liveSession.participants[participantIndex];

    // Check if already has permission
    if (participant.hasSpeakingPermission) {
      return res.status(400).json({ message: "You already have speaking permission" });
    }

    // Check if already requested
    if (participant.permissionRequested) {
      return res.status(400).json({ message: "You have already requested speaking permission" });
    }

    // Update permission request status
    liveSession.participants[participantIndex].permissionRequested = true;

    // Add to permission requests array
    liveSession.permissionRequests.push({
      studentId: req.user.id,
      status: "pending"
    });

    // Add system message
    const user = await User.findById(req.user.id);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: user.name,
      message: `${user.name} requested speaking permission`,
      messageType: "permission_request",
      metadata: {
        studentId: req.user.id,
        action: "request_speaking"
      }
    });

    await liveSession.save();

    res.json({
      message: "Speaking permission requested successfully",
      permissionRequested: true,
      status: "pending"
    });

  } catch (error) {
    console.error("Error requesting speaking permission:", error);
    res.status(500).json({ message: "Failed to request speaking permission", error: error.message });
  }
});

// 🔹 Grant Speaking Permission (Teacher only)
router.put("/grant-speaking/:sessionId/:studentId", verifyToken, async (req, res) => {
  try {
    const { sessionId, studentId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Check if user is teacher and owns the session
    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can grant speaking permission" });
    }

    // Find and update participant
    const participantIndex = liveSession.participants.findIndex(
      p => p.studentId.toString() === studentId
    );

    if (participantIndex === -1) {
      return res.status(404).json({ message: "Student not found in this session" });
    }

    // Grant speaking permission and unmute
    liveSession.participants[participantIndex].hasSpeakingPermission = true;
    liveSession.participants[participantIndex].isMuted = false;
    liveSession.participants[participantIndex].permissionRequested = false;

    // Update permission request status
    const requestIndex = liveSession.permissionRequests.findIndex(
      r => r.studentId.toString() === studentId && r.status === "pending"
    );

    if (requestIndex !== -1) {
      liveSession.permissionRequests[requestIndex].status = "approved";
      liveSession.permissionRequests[requestIndex].handledAt = new Date();
      liveSession.permissionRequests[requestIndex].handledBy = req.user.id;
    }

    // Add system message
    const teacher = await User.findById(req.user.id);
    const student = await User.findById(studentId);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: teacher.name,
      message: `${teacher.name} granted speaking permission to ${student.name}`,
      messageType: "permission_granted",
      metadata: {
        studentId: studentId,
        action: "grant_permission"
      }
    });

    await liveSession.save();

    res.json({
      message: "Speaking permission granted successfully",
      studentId,
      hasSpeakingPermission: true,
      isMuted: false
    });

  } catch (error) {
    console.error("Error granting speaking permission:", error);
    res.status(500).json({ message: "Failed to grant speaking permission", error: error.message });
  }
});

// 🔹 Revoke Speaking Permission (Teacher only)
router.put("/revoke-speaking/:sessionId/:studentId", verifyToken, async (req, res) => {
  try {
    const { sessionId, studentId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Check if user is teacher and owns the session
    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can revoke speaking permission" });
    }

    // Find and update participant
    const participantIndex = liveSession.participants.findIndex(
      p => p.studentId.toString() === studentId
    );

    if (participantIndex === -1) {
      return res.status(404).json({ message: "Student not found in this session" });
    }

    // Revoke speaking permission and mute
    liveSession.participants[participantIndex].hasSpeakingPermission = false;
    liveSession.participants[participantIndex].isMuted = true;
    liveSession.participants[participantIndex].permissionRequested = false;

    // Update any pending permission requests
    const requestIndex = liveSession.permissionRequests.findIndex(
      r => r.studentId.toString() === studentId && r.status === "pending"
    );

    if (requestIndex !== -1) {
      liveSession.permissionRequests[requestIndex].status = "rejected";
      liveSession.permissionRequests[requestIndex].handledAt = new Date();
      liveSession.permissionRequests[requestIndex].handledBy = req.user.id;
    }

    // Add system message
    const teacher = await User.findById(req.user.id);
    const student = await User.findById(studentId);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: teacher.name,
      message: `${teacher.name} revoked speaking permission from ${student.name}`,
      messageType: "permission_revoked",
      metadata: {
        studentId: studentId,
        action: "revoke_permission"
      }
    });

    await liveSession.save();

    res.json({
      message: "Speaking permission revoked successfully",
      studentId,
      hasSpeakingPermission: false,
      isMuted: true
    });

  } catch (error) {
    console.error("Error revoking speaking permission:", error);
    res.status(500).json({ message: "Failed to revoke speaking permission", error: error.message });
  }
});

// 🔹 Self-Mute (Student with speaking permission)
router.put("/self-mute/:sessionId", verifyToken, async (req, res) => {
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

    const participant = liveSession.participants[participantIndex];

    // Check if has speaking permission
    if (!participant.hasSpeakingPermission) {
      return res.status(403).json({ message: "You need speaking permission to self-mute" });
    }

    // Self-mute
    liveSession.participants[participantIndex].isMuted = true;

    await liveSession.save();

    res.json({
      message: "Self-muted successfully",
      isMuted: true
    });

  } catch (error) {
    console.error("Error self-muting:", error);
    res.status(500).json({ message: "Failed to self-mute", error: error.message });
  }
});

// 🔹 Self-Unmute (Student with speaking permission)
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

    const participant = liveSession.participants[participantIndex];

    // Check if has speaking permission
    if (!participant.hasSpeakingPermission) {
      return res.status(403).json({ message: "You need speaking permission to self-unmute" });
    }

    // Check if self-unmute is allowed
    if (!liveSession.settings.allowSelfUnmute) {
      return res.status(403).json({ message: "Self-unmute is currently disabled by the teacher" });
    }

    // Self-unmute
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

// 🔹 Mute All Students (Teacher only)
router.put("/mute-all/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Check if user is teacher and owns the session
    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can mute all students" });
    }

    // Mute all audience participants
    liveSession.participants.forEach((participant, index) => {
      if (participant.role === "audience") {
        liveSession.participants[index].isMuted = true;
      }
    });

    // Add system message
    const teacher = await User.findById(req.user.id);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: teacher.name,
      message: `${teacher.name} muted all students`,
      messageType: "system"
    });

    await liveSession.save();

    res.json({
      message: "All students muted successfully",
      mutedCount: liveSession.participants.filter(p => p.role === "audience").length
    });

  } catch (error) {
    console.error("Error muting all students:", error);
    res.status(500).json({ message: "Failed to mute all students", error: error.message });
  }
});

// 🔹 Unmute All Students (Teacher only)
router.put("/unmute-all/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Check if user is teacher and owns the session
    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can unmute all students" });
    }

    // Unmute all audience participants (only those with speaking permission)
    liveSession.participants.forEach((participant, index) => {
      if (participant.role === "audience" && participant.hasSpeakingPermission) {
        liveSession.participants[index].isMuted = false;
      }
    });

    // Add system message
    const teacher = await User.findById(req.user.id);
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: teacher.name,
      message: `${teacher.name} unmuted all students with speaking permission`,
      messageType: "system"
    });

    await liveSession.save();

    res.json({
      message: "All students with speaking permission unmuted successfully",
      unmutedCount: liveSession.participants.filter(p => p.role === "audience" && p.hasSpeakingPermission).length
    });

  } catch (error) {
    console.error("Error unmuting all students:", error);
    res.status(500).json({ message: "Failed to unmute all students", error: error.message });
  }
});

// 🔹 Update Session Settings (Teacher only)
router.put("/settings/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { allowSelfUnmute, autoMuteNewStudents } = req.body;

    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Check if user is teacher and owns the session
    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can update session settings" });
    }

    // Update settings
    if (typeof allowSelfUnmute === 'boolean') {
      liveSession.settings.allowSelfUnmute = allowSelfUnmute;
    }
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

// 🔹 Get Pending Permission Requests (Teacher only)
router.get("/pending-requests/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId)
      .populate("permissionRequests.studentId", "name email")
      .populate("participants.studentId", "name");

    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    // Check if user is teacher and owns the session
    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can view permission requests" });
    }

    const pendingRequests = liveSession.permissionRequests.filter(
      request => request.status === "pending"
    );

    res.json({
      pendingRequests: pendingRequests.map(request => ({
        requestId: request._id,
        studentId: request.studentId._id,
        studentName: request.studentId.name,
        studentEmail: request.studentId.email,
        requestedAt: request.requestedAt
      })),
      totalPending: pendingRequests.length
    });

  } catch (error) {
    console.error("Error fetching pending requests:", error);
    res.status(500).json({ message: "Failed to fetch pending requests", error: error.message });
  }
});

// 🔹 Enhanced Get Session Info (includes permission data)
router.get("/session/:sessionId", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findById(sessionId)
      .populate("classId", "title description")
      .populate("teacherId", "name")
      .populate("participants.studentId", "name role")
      .populate("chatMessages.userId", "name")
      .populate("permissionRequests.studentId", "name");

    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    res.json({
      session: liveSession,
      participants: liveSession.participants.map(p => ({
        studentId: p.studentId._id,
        name: p.studentId.name,
        role: p.studentId.role,
        isHandRaised: p.isHandRaised,
        isMuted: p.isMuted,
        hasSpeakingPermission: p.hasSpeakingPermission,
        permissionRequested: p.permissionRequested,
        videoOn: p.videoOn,
        totalTimeSpent: p.totalTimeSpent,
        lastJoinTime: p.lastJoinTime,
        joinedAt: p.joinedAt
      })),
      chatMessages: liveSession.chatMessages.map(m => ({
        userName: m.userId.name,
        message: m.message,
        timestamp: m.timestamp,
        messageType: m.messageType,
        metadata: m.metadata
      })),
      permissionRequests: liveSession.permissionRequests.map(r => ({
        requestId: r._id,
        studentId: r.studentId._id,
        studentName: r.studentId.name,
        status: r.status,
        requestedAt: r.requestedAt,
        handledAt: r.handledAt
      })),
      settings: liveSession.settings
    });

  } catch (error) {
    console.error("Error fetching session info:", error);
    res.status(500).json({ message: "Failed to fetch session info", error: error.message });
  }
});

// 🔹 Enhanced Raise/Lower Hand (Student) - Now includes permission request
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

    const participant = liveSession.participants[participantIndex];

    // Update hand raise status
    liveSession.participants[participantIndex].isHandRaised = action === "raise";

    // If raising hand and doesn't have speaking permission, auto-request permission
    if (action === "raise" && !participant.hasSpeakingPermission && !participant.permissionRequested) {
      liveSession.participants[participantIndex].permissionRequested = true;
      
      // Add to permission requests
      liveSession.permissionRequests.push({
        studentId: req.user.id,
        status: "pending"
      });
    }

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
      isHandRaised: action === "raise",
      permissionRequested: action === "raise" && !participant.hasSpeakingPermission
    });

  } catch (error) {
    console.error("Error updating hand status:", error);
    res.status(500).json({ message: "Failed to update hand status", error: error.message });
  }
});

// 🔹 Enhanced Mute/Unmute Student (Teacher only)
router.put("/mute/:sessionId/:studentId", verifyToken, async (req, res) => {
  try {
    const { sessionId, studentId } = req.params;
    const { mute } = req.body; // true or false

    // Check if user is teacher and owns the session
    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: "Live session not found" });
    }

    if (liveSession.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the teacher can mute students" });
    }

    // Find and update participant
    const participantIndex = liveSession.participants.findIndex(
      p => p.studentId.toString() === studentId
    );

    if (participantIndex === -1) {
      return res.status(404).json({ message: "Student not found in this session" });
    }

    liveSession.participants[participantIndex].isMuted = mute;

    // Add system message
    const teacher = await User.findById(req.user.id);
    const student = await User.findById(studentId);
    const actionText = mute ? "muted" : "unmuted";
    
    liveSession.chatMessages.push({
      userId: req.user.id,
      userName: teacher.name,
      message: `${teacher.name} ${actionText} ${student.name}`,
      messageType: "system"
    });

    await liveSession.save();

    res.json({
      message: `Student ${actionText} successfully`,
      studentId,
      isMuted: mute
    });

  } catch (error) {
    console.error("Error updating mute status:", error);
    res.status(500).json({ message: "Failed to update mute status", error: error.message });
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

export default router;