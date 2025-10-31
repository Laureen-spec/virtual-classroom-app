import mongoose from "mongoose";

const liveSessionSchema = new mongoose.Schema({
  classId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "ClassSchedule", 
    required: true 
  },
  teacherId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  // ADD THIS NEW FIELD:
  allowTeacherRejoin: {
    type: Boolean,
    default: true  // Allow teachers to rejoin by default
  },
  channelName: { 
    type: String, 
    required: true, 
    unique: true 
  },
  sessionTitle: { 
    type: String, 
    required: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  startTime: { 
    type: Date, 
    default: Date.now 
  },
  endTime: { 
    type: Date 
  },
  participants: [{
    studentId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    },
    joinedAt: { 
      type: Date, 
      default: Date.now 
    },
    leftAt: { 
      type: Date 
    },
    lastJoinTime: { 
      type: Date 
    },
    totalTimeSpent: { 
      type: Number, 
      default: 0 
    },
    isHandRaised: { 
      type: Boolean, 
      default: false 
    },
    isMuted: { 
      type: Boolean, 
      default: true  // All students join muted by default
    },
    hasSpeakingPermission: { 
      type: Boolean, 
      default: false  // Students need permission to self-unmute
    },
    permissionRequested: { 
      type: Boolean, 
      default: false  // Track if student requested to speak
    },
    role: { 
      type: String, 
      enum: ["host", "audience"], 
      default: "audience" 
    },
    videoOn: { 
      type: Boolean, 
      default: false 
    },
    // ADDED: Screen sharing field
    isScreenSharing: {
      type: Boolean,
      default: false
    }
  }],
  chatMessages: [{
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    },
    userName: { 
      type: String, 
      required: true 
    },
    message: { 
      type: String, 
      required: true 
    },
    timestamp: { 
      type: Date, 
      default: Date.now 
    },
    messageType: { 
      type: String, 
      enum: ["text", "system", "permission_request", "permission_granted", "permission_revoked"], 
      default: "text" 
    },
    // Additional fields for permission-related messages
    metadata: {
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      action: { type: String }, // "request_speaking", "grant_permission", "revoke_permission"
      targetStudentId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    }
  }],
  // Track permission requests for teacher dashboard
  permissionRequests: [{
    studentId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User",
      required: true 
    },
    requestedAt: { 
      type: Date, 
      default: Date.now 
    },
    status: { 
      type: String, 
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    handledAt: { 
      type: Date 
    },
    handledBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    }
  }],
  settings: {
    allowSelfUnmute: { 
      type: Boolean, 
      default: false  // Teacher controls if students can self-unmute
    },
    autoMuteNewStudents: { 
      type: Boolean, 
      default: true   // Automatically mute new students when they join
    }
  }
}, {
  timestamps: true
});

// Index for faster queries on active sessions and permission requests
liveSessionSchema.index({ isActive: 1 });
liveSessionSchema.index({ "permissionRequests.status": 1 });
liveSessionSchema.index({ "participants.studentId": 1 });

export default mongoose.model("LiveSession", liveSessionSchema);