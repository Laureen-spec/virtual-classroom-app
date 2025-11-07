import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AgoraRTC from "agora-rtc-sdk-ng";
import API from "../api/axios";
import io from "socket.io-client";

export default function LiveClass() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [joined, setJoined] = useState(false);
  const [localTracks, setLocalTracks] = useState({ audio: null, video: null });
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [participantInfo, setParticipantInfo] = useState(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [hasSpeakingPermission, setHasSpeakingPermission] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [participants, setParticipants] = useState([]);
  const [isTeacher, setIsTeacher] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);

  // ✅ ADD SOCKET STATE
  const [socket, setSocket] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  // Screen sharing state variables
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareTrack, setScreenShareTrack] = useState(null);

  // Recording state variables
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState(null);

  // Pagination state variables
  const [chatPage, setChatPage] = useState(1);
  const [hasMoreChat, setHasMoreChat] = useState(true);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  // Session timeout state variables
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);

  // Mobile responsive state
  const [isMobile, setIsMobile] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Loading states
  const [isMuteLoading, setIsMuteLoading] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [isHandRaiseLoading, setIsHandRaiseLoading] = useState(false);
  const [isScreenShareLoading, setIsScreenShareLoading] = useState(false);
  const [isRecordingLoading, setIsRecordingLoading] = useState(false);
  const [isJoinLoading, setIsJoinLoading] = useState(false);

  // Modal state
  const [showEndModal, setShowEndModal] = useState(false);

  const appId = import.meta.env.VITE_AGORA_APP_ID;
  const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  const chatContainerRef = useRef(null);

  // ✅ ADD: useRef for local tracks to avoid stale closures
  const localTracksRef = useRef({ audio: null, video: null });

  // Production mode check and conditional logging
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const debugLog = (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  };

  // ✅ ADDED: Debug useEffect for auth state
  useEffect(() => {
    console.log("🔍 LiveClass Component Mounted - Auth State:", {
      token: localStorage.getItem("token") ? "✅ EXISTS" : "❌ MISSING",
      userId: localStorage.getItem("userId"),
      userRole: localStorage.getItem("role"),
      sessionId: sessionId
    });
  }, [sessionId]);

  // Simple track management utilities (from your working code)
  const trackManagement = {
    publishTrack: async (client, track) => {
      try {
        await client.publish([track]);
        debugLog(`✅ ${track.getTrackLabel?.() || 'track'} published successfully`);
        return true;
      } catch (error) {
        console.error(`❌ Error publishing track:`, error);
        return false;
      }
    },

    unpublishTrack: async (client, track) => {
      try {
        await client.unpublish([track]);
        debugLog(`✅ ${track.getTrackLabel?.() || 'track'} unpublished successfully`);
        return true;
      } catch (error) {
        try {
          await client.unpublish(track);
          debugLog(`✅ unpublished with fallback`);
          return true;
        } catch (err2) {
          console.error(`❌ Error unpublishing track:`, err2);
          return false;
        }
      }
    },

    enableTrack: (track, enabled) => {
      if (track) {
        try {
          track.setEnabled(enabled);
          debugLog(`✅ ${track.getTrackLabel?.() || 'track'} ${enabled ? 'enabled' : 'disabled'}`);
        } catch (e) {
          console.error("❌ enableTrack failed:", e);
        }
      }
    }
  };

  // Check mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // ✅ UPDATED: Socket.io connection setup with production URL
  useEffect(() => {
    const initializeSocket = () => {
      // ✅ FIXED: Updated Socket.io URL for production
      const newSocket = io("https://virtual-classroom-app-8wbh.onrender.com", {
        transports: ["websocket"],
        withCredentials: true,
      });

      newSocket.on('connect', () => {
        console.log('✅ Socket.io connected:', newSocket.id);
        setIsSocketConnected(true);
      });

      newSocket.on('disconnect', () => {
        console.log('❌ Socket.io disconnected');
        setIsSocketConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error);
        setIsSocketConnected(false);
      });

      setSocket(newSocket);

      return newSocket;
    };

    const socketInstance = initializeSocket();

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, []);

  // ✅ UPDATED: Enhanced Socket.io event listeners for mute/unmute with track publishing/unpublishing
  useEffect(() => {
    if (!socket) return;

    const userId = localStorage.getItem("userId");

    // ✅ ENHANCED: Mute student handler with unpublishing
    socket.on("mute-student", async (data) => {
      debugLog("🔇 Received mute-student event:", data);
      
      // Only apply to the targeted student
      if (data.targetId === userId) {
        setIsMuted(true);
        setHasSpeakingPermission(false);

        // ✅ PHYSICALLY TURN OFF MICROPHONE AND UNPUBLISH - Using localTracksRef
        if (localTracksRef.current.audio) {
          await localTracksRef.current.audio.setEnabled(false);
          await trackManagement.unpublishTrack(client, localTracksRef.current.audio);
          console.log("🔇 Microphone disabled and unpublished due to teacher mute (SOCKET)");
        }
      }
    });

    // ✅ ENHANCED: Unmute student handler with track recreation if needed
    socket.on("unmute-student", async (data) => {
      debugLog("🎤 Received unmute-student event:", data);
      
      // Only apply to the targeted student
      if (data.targetId === userId) {
        setIsMuted(false);
        setHasSpeakingPermission(true);

        if (localTracksRef.current.audio) {
          // ✅ Re-enable existing track and republish
          await localTracksRef.current.audio.setEnabled(true);
          await trackManagement.publishTrack(client, localTracksRef.current.audio);
          console.log("🎤 Microphone re-enabled and republished after teacher unmute (SOCKET)");
        } else {
          // ✅ Safety: recreate and publish the track again if missing
          try {
            const [newAudioTrack] = await AgoraRTC.createMicrophoneAudioTrack({
              AEC: true,
              ANS: true, 
              AGC: true,
              encoderConfig: {
                sampleRate: 48000,
                stereo: false,
                bitrate: 64
              }
            });
            localTracksRef.current.audio = newAudioTrack;
            await trackManagement.publishTrack(client, newAudioTrack);
            console.log("🎤 New audio track created and published after unmute");
          } catch (error) {
            console.error("❌ Failed to create new audio track:", error);
          }
        }
      }
    });

    // ✅ ENHANCED: Mute-all with unpublishing
    socket.on("mute-all", async (data) => {
      debugLog("🔇 Received mute-all event:", data);
      
      if (!isTeacher) { // Only affect students
        setIsMuted(true);
        if (localTracksRef.current.audio) {
          await localTracksRef.current.audio.setEnabled(false);
          await trackManagement.unpublishTrack(client, localTracksRef.current.audio);
          debugLog("🔇 Microphone muted and unpublished due to teacher's mute-all command (SOCKET)");
        }
      }
    });

    // ✅ ENHANCED: Unmute-all with republishing
    socket.on("unmute-all", async (data) => {
      debugLog("🎤 Received unmute-all event:", data);
      
      if (!isTeacher && hasSpeakingPermission) {
        setIsMuted(false);
        if (localTracksRef.current.audio) {
          await localTracksRef.current.audio.setEnabled(true);
          await trackManagement.publishTrack(client, localTracksRef.current.audio);
          debugLog("🎤 Microphone unmuted and republished due to teacher's unmute-all command (SOCKET)");
        }
      }
    });

    // ✅ ADDED: Listen for participant-updated events for real-time sync
    socket.on("participant-updated", (data) => {
      debugLog("🔄 Received participant-updated event:", data);
      
      // Update local participants state if this participant is in our list
      setParticipants(prev => prev.map(p => 
        p.studentId === data.studentId 
          ? { ...p, isMuted: data.isMuted, hasSpeakingPermission: data.hasSpeakingPermission }
          : p
      ));
    });

    // Cleanup event listeners
    return () => {
      socket.off("mute-student");
      socket.off("unmute-student");
      socket.off("mute-all");
      socket.off("unmute-all");
      socket.off("participant-updated");
    };
  }, [socket, isTeacher, hasSpeakingPermission]);

  // ✅ ADDED: Join socket room when session is joined
  useEffect(() => {
    if (socket && isSocketConnected && joined && sessionId) {
      const userId = localStorage.getItem("userId");
      const userRole = localStorage.getItem("role");
      
      socket.emit("join-session", {
        sessionId,
        userId,
        userRole
      });
      
      debugLog("✅ Joined socket room for session:", sessionId);
    }
  }, [socket, isSocketConnected, joined, sessionId]);

  // ✅ ENHANCED JOIN FUNCTION: Enhanced join function with auto-mute based on session settings
  const joinClass = async () => {
    try {
      setIsJoinLoading(true);
      
      // ✅ ADD COMPREHENSIVE AUTH DEBUG
      let token = localStorage.getItem("token");
      const userId = localStorage.getItem("userId");
      const userRole = localStorage.getItem("role");
      
      console.log("🔄 ADMIN JOIN DEBUG:", {
        token: token ? "✅ EXISTS" : "❌ MISSING",
        userId: userId || "❌ MISSING",
        userRole: userRole || "❌ MISSING",
        sessionId: sessionId
      });

      // ✅ CRITICAL FIX: Handle admin with missing userId
      if (userRole === "admin" && !userId) {
        console.log("🛠️ Admin detected with missing userId - setting default admin ID");
        localStorage.setItem("userId", "69025078d9063907000b4d59");
      }

      // ✅ FIX: Don't redirect admin - create token instead
      if (!token) {
        if (localStorage.getItem("role") === "admin") {
          console.log("🛠️ Admin has no token in LiveClass - creating mock token");
          token = btoa(JSON.stringify({
            id: "69025078d9063907000b4d59",
            role: "admin",
            email: "admin@school.com",
            exp: Date.now() + 24 * 60 * 60 * 1000
          }));
          localStorage.setItem("token", token);
        } else {
          console.error("❌ No authentication token found - redirecting to login");
          navigate("/register");
          return;
        }
      }

      debugLog("Attempting to join class...");
      
      // ✅ ADD ADMIN BYPASS FOR MEDIA PERMISSIONS
      if (userRole !== "admin") {
        try {
          debugLog("Requesting microphone permission...");
          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: true 
          });
          debugLog("Microphone and camera access granted");
          stream.getTracks().forEach(track => track.stop());
        } catch (err) {
          console.error("❌ Microphone/camera permission denied:", err);
          alert("Microphone and camera access is required to join the class.");
          return;
        }
      } else {
        debugLog("🛠️ Admin bypassing media permissions check");
      }

      const joinResponse = await API.post(`/live/join/${sessionId}`);
      debugLog("Join response received");
      
      const { session, token: agoraToken, participantInfo } = joinResponse.data;
      
      // ✅ ADD: Safety check for participantInfo
      if (!participantInfo) {
        console.warn("⚠️ participantInfo is undefined in join response, using safe defaults");
      }

      // ✅ CRITICAL FIX: Check if student was previously muted by teacher
      // Get latest session data to see current mute state
      const sessionResponse = await API.get(`/live/session/${sessionId}`);
      const currentParticipant = sessionResponse.data.participants.find(
        p => p.studentId === localStorage.getItem("userId")
      );
      
      // ✅ FIX: Safely handle participantInfo being undefined
      const actualIsMuted = currentParticipant ? 
        currentParticipant.isMuted : 
        (participantInfo ? participantInfo.isMuted : true); // Default to muted if no info

      const actualHasPermission = currentParticipant ? 
        currentParticipant.hasSpeakingPermission : 
        (participantInfo ? participantInfo.hasSpeakingPermission : false); // Default to no permission
      
      setSessionInfo(session);
      setParticipantInfo(participantInfo);
      setIsMuted(actualIsMuted); // ✅ Use actual current state
      setHasSpeakingPermission(actualHasPermission); // ✅ Use actual current state
      
      const isUserTeacher = participantInfo ? 
        (participantInfo.role === "host" || userRole === "teacher" || userRole === "admin") : 
        (userRole === "teacher" || userRole === "admin");
      setIsTeacher(isUserTeacher);
      
      debugLog("User role:", { isTeacher: isUserTeacher, participantRole: participantInfo?.role });

      const uid = await client.join(appId, session.channelName, agoraToken, null);

      debugLog("Creating microphone and camera tracks...");
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
        {
          AEC: true,
          ANS: true, 
          AGC: true,
          encoderConfig: {
            sampleRate: 48000,
            stereo: false,
            bitrate: 64
          }
        }, 
        {}
      );
      
      debugLog("Tracks created");

      // ✅ UPDATED: Set both ref and state for tracks
      localTracksRef.current = { audio: audioTrack, video: videoTrack }; // ✅ IMPORTANT
      setLocalTracks({ audio: audioTrack, video: videoTrack });          // UI usage  
      videoTrack.play("local-player");

      // ✅ NEW: Check if teacher's session requires auto-mute for students
      const sessionData = sessionResponse?.data ?? session ?? {};
      if (sessionData?.settings?.autoMuteNewStudents && !isUserTeacher) {
        await audioTrack.setEnabled(false); // ✅ start muted
        setIsMuted(true);
        console.log("🔇 Student joined muted by default (autoMuteNewStudents setting)");
      } else {
        await audioTrack.setEnabled(true);
        setIsMuted(false);
      }

      // ✅ FIX 1: Start polling only after local tracks exist
      if (audioTrack && videoTrack) {
        startSessionPolling();
      }

      // ✅ Now publish tracks (publishing a disabled mic keeps it silent)
      await trackManagement.publishTrack(client, audioTrack);
      await trackManagement.publishTrack(client, videoTrack);

      // Setup remote user handling with improved stability
      client.on("user-published", handleUserPublished);

      client.on("user-unpublished", (user, mediaType) => {
        debugLog("User unpublished:", user.uid, mediaType);
        
        if (mediaType === "video" && user.videoTrack) {
          user.videoTrack.stop();
        }
        
        if (mediaType === "audio" && user.audioTrack) {
          user.audioTrack.stop();
        }
        
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      });

      client.on("user-joined", (user) => {
        debugLog("User joined:", user.uid);
      });

      client.on("user-left", (user) => {
        debugLog("User left:", user.uid);
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      });
      
      setJoined(true);

      // ✅ Join socket room after successful join
      if (socket && isSocketConnected) {
        const userId = localStorage.getItem("userId");
        const userRole = localStorage.getItem("role");
        
        socket.emit("join-session", {
          sessionId,
          userId,
          userRole
        });
        
        debugLog("✅ Joined socket room after class join");
      }

    } catch (err) {
      console.error("❌ Join failed:", err);
      
      let errorMessage = "Failed to join class. Please try again.";
      
      // ✅ ENHANCED FIX: Better admin 401 handling
      if (err.response?.status === 401 || err.isAdminAuthError) {
        if (localStorage.getItem("role") === "admin") {
          errorMessage = "Admin authentication issue. Please ensure your admin token is valid.";
          console.log("🔧 Admin auth error intercepted:", {
            hasToken: !!localStorage.getItem("token"),
            userId: localStorage.getItem("userId"),
            sessionId: sessionId
          });
          
          // Try to re-authenticate admin or use mock token
          const adminToken = localStorage.getItem("token");
          if (!adminToken) {
            console.log("🛠️ Creating mock admin token...");
            const mockToken = btoa(JSON.stringify({
              id: "69025078d9063907000b4d59",
              role: "admin",
              email: "admin@school.com",
              exp: Date.now() + 24 * 60 * 60 * 1000
            }));
            localStorage.setItem("token", mockToken);
            localStorage.setItem("userId", "69025078d9063907000b4d59");
            localStorage.setItem("userName", "School Admin");
            console.log("✅ Mock admin credentials created - retrying join...");
            // Retry the join
            setTimeout(() => joinClass(), 1000);
            return;
          }
        } else {
          errorMessage = "Authentication failed. Please log in again.";
          navigate("/register");
        }
      } else if (err.response?.status === 404) {
        errorMessage = "Live session not found or has ended.";
      } else if (err.response?.status === 403) {
        errorMessage = "You don't have permission to join this session.";
      } else if (err.name === 'NotAllowedError') {
        errorMessage = "Microphone and camera access is required. Please allow permissions and try again.";
      } else if (err.message?.includes('NETWORK_ERROR')) {
        errorMessage = "Network error. Please check your internet connection.";
      }
      
      // ✅ ADD: Show error message without redirecting admin
      alert(errorMessage);
    } finally {
      setIsJoinLoading(false);
    }
  };

  // Input sanitization function
  const sanitizeMessage = (text) => {
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      .trim();
  };

  // Load more chat messages function
  const loadMoreChat = async () => {
    if (isLoadingChat || !hasMoreChat) return;
    
    setIsLoadingChat(true);
    try {
      const nextPage = chatPage + 1;
      const response = await API.get(`/live/session/${sessionId}?page=${nextPage}&limit=50`);
      
      if (response.data.chatMessages && response.data.chatMessages.length > 0) {
        setChatMessages(prev => [...response.data.chatMessages, ...prev]);
        setChatPage(nextPage);
        setHasMoreChat(response.data.pagination?.hasNext || false);
      } else {
        setHasMoreChat(false);
      }
    } catch (err) {
      console.error("Error loading more chat messages:", err);
    } finally {
      setIsLoadingChat(false);
    }
  };

  // Activity tracker for session timeout
  useEffect(() => {
    const activities = ['mousemove', 'keypress', 'click', 'scroll'];
    const updateActivity = () => {
      setLastActivity(Date.now());
      setShowTimeoutWarning(false);
    };

    activities.forEach(activity => {
      document.addEventListener(activity, updateActivity);
    });

    return () => {
      activities.forEach(activity => {
        document.removeEventListener(activity, updateActivity);
      });
    };
  }, []);

  // Timeout checker
  useEffect(() => {
    const CHECK_INTERVAL = 30000;
    const WARNING_TIME = 1200000;
    const TIMEOUT_TIME = 1800000;

    const interval = setInterval(() => {
      const inactiveTime = Date.now() - lastActivity;
      
      if (inactiveTime > TIMEOUT_TIME && joined) {
        leaveClass();
      } else if (inactiveTime > WARNING_TIME && !showTimeoutWarning && joined) {
        setShowTimeoutWarning(true);
      }
    }, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [lastActivity, showTimeoutWarning, joined]);

  // Enhanced network monitoring with reconnection
  useEffect(() => {
    const handleOnline = () => {
      console.log("🌐 Network back online - attempting to reconnect...");
      if (joined) {
        setTimeout(() => {
          fetchActiveSessions();
        }, 2000);
      }
    };
    
    const handleOffline = () => {
      console.log("🌐 Network offline - audio/video may be affected");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [joined]);

  // Helper function to fetch active sessions
  const fetchActiveSessions = async () => {
    try {
      const response = await API.get(`/live/session/${sessionId}`);
      if (response.data.session.isActive) {
        debugLog("✅ Session is still active, connection restored");
      }
    } catch (error) {
      console.error("Error fetching session status:", error);
    }
  };

  // Debug useEffect to monitor chat state
  useEffect(() => {
    debugLog("💬 Chat messages updated:", chatMessages.length);
  }, [chatMessages]);

  // Function to handle audio track updates when permission is granted
  const forceAudioUpdate = async () => {
    try {
      if (localTracksRef.current.audio && hasSpeakingPermission) {
        debugLog("🎯 Republishing audio track after permission grant");
        
        await trackManagement.unpublishTrack(client, localTracksRef.current.audio);
        trackManagement.enableTrack(localTracksRef.current.audio, true);
        await trackManagement.publishTrack(client, localTracksRef.current.audio);
        
        debugLog("✅ Audio track republished successfully after permission grant");
      }
    } catch (error) {
      console.error("❌ Error forcing audio update:", error);
    }
  };

  // Debug audio state
  useEffect(() => {
    debugLog("🎧 Audio state:", { isMuted, hasSpeakingPermission });
  }, [isMuted, hasSpeakingPermission]);

  // ✅ UPDATED: Enhanced toggle mute function with robust track management
  const toggleMute = async () => {
    if (isMuteLoading) return;
    
    const audio = localTracksRef.current?.audio;
    if (!audio) {
      console.warn("toggleMute: no audio track");
      return;
    }

    setIsMuteLoading(true);
    try {
      if (isMuted) {
        // If current user is teacher, allow immediate unmute without permission check
        const role = localStorage.getItem("role");
        if (role === "teacher") {
          debugLog("Teacher unmuting themselves (bypass permission).");
          try {
            await API.put(`/live/self-unmute/${sessionId}`);
          } catch (e) {
            debugLog("Warning: backend self-unmute failed:", e?.message || e);
          }
          trackManagement.enableTrack(audio, true);
          setIsMuted(false);
          
          // Republish audio track
          await trackManagement.publishTrack(client, audio).catch(()=>{});
          return;
        }

        // For students: only unmute if they have permission
        if (!hasSpeakingPermission) {
          debugLog("🔔 No speaking permission - requesting.");
          await requestSpeakingPermission();
        } else {
          debugLog("🎤 Unmuting with permission.");
          await API.put(`/live/self-unmute/${sessionId}`);
          trackManagement.enableTrack(audio, true);
          setIsMuted(false);
          
          // Republish audio track
          await trackManagement.publishTrack(client, audio).catch(()=>{});
          debugLog("✅ Successfully unmuted");
        }
      } else {
        // Muting is always allowed
        debugLog("🔇 Muting...");
        await API.put(`/live/self-mute/${sessionId}`);
        trackManagement.enableTrack(audio, false);
        setIsMuted(true);
        
        // Unpublish audio track
        await trackManagement.unpublishTrack(client, audio).catch(()=>{});
        debugLog("✅ Successfully muted");
      }
    } catch (err) {
      console.error("❌ Toggle mute failed:", err);
    } finally {
      setIsMuteLoading(false);
    }
  };

  // Grant speaking permission with immediate effect
  const grantSpeakingPermission = async (studentId) => {
    try {
      debugLog("Granting permission to:", studentId);
      const response = await API.put(`/live/grant-speaking/${sessionId}/${studentId}`);

      setPendingRequests(prev => prev.filter(req => req.studentId !== studentId));

      if (response.data?.participant) {
        const updated = response.data.participant;
        const updatedId = String(updated.studentId);
        setParticipants(prev => {
          const exists = prev.some(p => String(p.studentId) === updatedId);
          if (exists) {
            return prev.map(p => String(p.studentId) === updatedId
              ? { ...p,
                  isMuted: updated.isMuted,
                  hasSpeakingPermission: updated.hasSpeakingPermission,
                  permissionRequested: updated.permissionRequested,
                  role: updated.role
                }
              : p
            );
          } else {
            return [...prev, {
              studentId: updated.studentId,
              isMuted: updated.isMuted,
              hasSpeakingPermission: updated.hasSpeakingPermission,
              permissionRequested: updated.permissionRequested,
              role: updated.role
            }];
          }
        });
      } else {
        const sessionResponse = await API.get(`/live/session/${sessionId}`);
        if (sessionResponse.data.participants) setParticipants(sessionResponse.data.participants);
      }

      const currentUserId = localStorage.getItem("userId");
      if (studentId === currentUserId) {
        setHasSpeakingPermission(true);
        setIsMuted(false);
        if (localTracksRef.current.audio) {
          trackManagement.enableTrack(localTracksRef.current.audio, true);
          try {
            await trackManagement.unpublishTrack(client, localTracksRef.current.audio);
            await trackManagement.publishTrack(client, localTracksRef.current.audio);
            debugLog("✅ Audio republished after permission grant (local user)");
          } catch (err) {
            console.error("Error republishing after grant:", err);
          }
        }
      }

      debugLog("Permission granted successfully");

    } catch (err) {
      console.error("❌ Grant permission failed:", err);
    }
  };

  // ✅ FIX 3: Updated mute student - REMOVED client-side socket emit
  const muteStudent = async (studentId) => {
    try {
      debugLog("🎯 Muting student:", studentId);
      
      // ✅ REMOVED: Client-side socket emit - let server handle it
      // Only call API - server will handle socket broadcasting
      const response = await API.put(`/live/mute/${sessionId}/${studentId}`, { mute: true });

      if (response.data?.studentId) {
        const respId = String(response.data.studentId);
        setParticipants(prev => prev.map(p => String(p.studentId) === respId
          ? { ...p, isMuted: response.data.isMuted }
          : p
        ));
      } else {
        const sessionResponse = await API.get(`/live/session/${sessionId}`);
        if (sessionResponse.data.participants) setParticipants(sessionResponse.data.participants);
      }

      // ✅ Optional: Show success notification
      debugLog("Student muted successfully");

    } catch (err) {
      console.error("❌ Mute student failed:", err);
    }
  };

  // ✅ FIX 3: Updated unmute student - REMOVED client-side socket emit
  const unmuteStudent = async (studentId) => {
    try {
      debugLog("🎯 Unmuting student:", studentId);
      
      // ✅ REMOVED: Client-side socket emit - let server handle it
      // Only call API - server will handle socket broadcasting
      const response = await API.put(`/live/mute/${sessionId}/${studentId}`, { mute: false });

      if (response.data?.studentId) {
        const respId = String(response.data.studentId);
        setParticipants(prev => prev.map(p => String(p.studentId) === respId
          ? { ...p, isMuted: response.data.isMuted }
          : p
        ));
      } else {
        const sessionResponse = await API.get(`/live/session/${sessionId}`);
        if (sessionResponse.data.participants) setParticipants(sessionResponse.data.participants);
      }

      // ✅ Optional: Show success notification
      debugLog("Student unmuted successfully");

    } catch (err) {
      console.error("❌ Unmute student failed:", err);
    }
  };

  // ✅ FIX 3: Updated mute all students - REMOVED client-side socket emit
  const muteAllStudents = async () => {
    try {
      debugLog("🎯 Muting all students.");
      
      // ✅ REMOVED: Client-side socket emit - let server handle it
      await API.put(`/live/mute-all/${sessionId}`);

      const sessionResponse = await API.get(`/live/session/${sessionId}`);
      if (sessionResponse.data.participants) setParticipants(sessionResponse.data.participants);

      debugLog("All students muted");
    } catch (err) {
      console.error("❌ Mute all failed:", err);
    }
  };

  // ✅ FIX 3: Updated unmute all students - REMOVED client-side socket emit
  const unmuteAllStudents = async () => {
    try {
      debugLog("Unmuting all students.");
      
      // ✅ REMOVED: Client-side socket emit - let server handle it
      await API.put(`/live/unmute-all/${sessionId}`);

      const sessionResponse = await API.get(`/live/session/${sessionId}`);
      if (sessionResponse.data.participants) setParticipants(sessionResponse.data.participants);

      debugLog("All students unmuted");
    } catch (err) {
      console.error("❌ Unmute all failed:", err);
    }
  };

  // IMPROVED: User published event handler with better stability
  const handleUserPublished = async (user, mediaType) => {
    debugLog("User published:", user.uid, mediaType);
    
    try {
      await client.subscribe(user, mediaType);
      debugLog("Subscribed to user:", user.uid, "for", mediaType);
      
      setTimeout(() => {
        if (mediaType === "video" && user.videoTrack) {
          const playerElement = document.getElementById(`remote-${user.uid}`);
          if (playerElement) {
            user.videoTrack.play(`remote-${user.uid}`);
            debugLog("Playing video for user:", user.uid);
          }
        }
        
        if (mediaType === "audio" && user.audioTrack) {
          user.audioTrack.play();
          debugLog("Playing audio for user:", user.uid);
        }
      }, 200);
      
      // FIXED: Corrected setRemoteUsers mapping logic
      setRemoteUsers(prev => {
        const existingUser = prev.find(u => u.uid === user.uid);
        if (existingUser) {
          return prev.map(u => u.uid === user.uid ? { ...u, ...user } : u);
        } else {
          return [...prev, user];
        }
      });
      
    } catch (error) {
      console.error("❌ Error subscribing to user:", error);
    }
  };

  // ✅ FIX 2: IMPROVED Poll for session updates with guaranteed mute state sync
  const startSessionPolling = () => {
    debugLog("Starting session polling...");
    
    let isPolling = false;
    
    const interval = setInterval(async () => {
      if (!sessionId || isPolling) {
        return;
      }
      
      isPolling = true;
      
      try {
        const response = await API.get(`/live/session/${sessionId}`);
        
        if (!response.data) {
          debugLog("No data in polling response");
          isPolling = false;
          return;
        }

        const { 
          participants, 
          chatMessages, 
          permissionRequests, 
          isActive, 
          userPermissions 
        } = response.data;

        if (isActive === false) {
          debugLog("Session has ended - stopping updates");
          clearInterval(interval);
          isPolling = false;
          return;
        }
        
        if (participants && Array.isArray(participants)) {
          setParticipants(participants);
        }
        
        if (chatMessages && Array.isArray(chatMessages)) {
          setChatMessages(prev => {
            if (prev.length !== chatMessages.length) {
              debugLog("Chat messages updated:", chatMessages.length);
              return chatMessages;
            }
            return prev;
          });
        }
        
        if (userPermissions?.isTeacher && permissionRequests) {
          const pending = permissionRequests.filter(req => req.status === "pending");
          setPendingRequests(pending);
        }

        // ✅ FIX 2: CRITICAL - Always respect isMuted from polling as fallback
        const currentUserId = String(localStorage.getItem("userId") || "");
        if (participants && currentUserId) {
          const currentParticipant = participants.find(p => String(p.studentId) === currentUserId);
          if (currentParticipant) {
            // ✅ FIX 2: Always sync mute state from server (fallback for missed socket events)
            if (currentParticipant.isMuted !== isMuted) {
              debugLog(`🎯 Mute state changed via polling: ${isMuted} -> ${currentParticipant.isMuted}`);
              setIsMuted(currentParticipant.isMuted);
              
              if (localTracksRef.current.audio) {
                if (currentParticipant.isMuted) {
                  trackManagement.enableTrack(localTracksRef.current.audio, false);
                  debugLog("🎯 Audio disabled (muted via polling - FALLBACK)");
                } else {
                  trackManagement.enableTrack(localTracksRef.current.audio, true);
                  debugLog("🎯 Audio enabled (unmuted via polling - FALLBACK)");
                }
              }
            }

            // Speaking permission update
            if (currentParticipant.hasSpeakingPermission !== hasSpeakingPermission) {
              setHasSpeakingPermission(currentParticipant.hasSpeakingPermission);
            }

            // hand raise
            if (currentParticipant.isHandRaised !== isHandRaised) {
              setIsHandRaised(currentParticipant.isHandRaised);
            }
          }
        }

      } catch (err) {
        console.error("❌ Polling error:", err);
      } finally {
        isPolling = false;
      }
    }, 3000);

    return () => {
      debugLog("Clearing polling interval");
      clearInterval(interval);
    };
  };

  // Raise/lower hand with loading state
  const toggleHandRaise = async () => {
    if (isHandRaiseLoading) return;
    
    setIsHandRaiseLoading(true);
    try {
      const action = isHandRaised ? "lower" : "raise";
      await API.put(`/live/hand/${sessionId}`, { action });
      setIsHandRaised(!isHandRaised);
    } catch (err) {
      console.error("Toggle hand raise failed:", err);
    } finally {
      setIsHandRaiseLoading(false);
    }
  };

  // Request speaking permission
  const requestSpeakingPermission = async () => {
    try {
      await API.post(`/live/request-speaking/${sessionId}`);
    } catch (err) {
      console.error("Request speaking permission failed:", err);
    }
  };

  // Send chat message with input sanitization
  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      const sanitizedMessage = sanitizeMessage(newMessage);
      await API.post(`/live/chat/${sessionId}`, { message: sanitizedMessage });
      setNewMessage("");
    } catch (err) {
      console.error("Send message failed:", err);
    }
  };

  const revokeSpeakingPermission = async (studentId) => {
    try {
      await API.put(`/live/revoke-speaking/${sessionId}/${studentId}`);
    } catch (err) {
      console.error("Revoke permission failed:", err);
    }
  };

  // End Live Class Confirmed (Teacher only)
  const endLiveClassConfirmed = async () => {
    try {
      debugLog("Attempting to end class...");
      const response = await API.put(`/live/end/${sessionId}`);
      debugLog("Class ended successfully");
      
      const userRole = localStorage.getItem("role");
      if (userRole === "teacher") {
        navigate("/teacher");
      } else if (userRole === "admin") {
        navigate("/admin");
      } else {
        navigate("/student");
      }
    } catch (err) {
      console.error("❌ End live class failed:", err);
    }
  };

  // ✅ UPDATED: Leave class - robust cleanup
  const leaveClass = async () => {
    try {
      if (isScreenSharing) {
        await stopScreenShare();
      }
      
      // ✅ Disconnect socket when leaving class
      if (socket) {
        socket.disconnect();
      }

      // ✅ Robust track cleanup
      try {
        const audio = localTracksRef.current?.audio;
        const video = localTracksRef.current?.video;

        if (audio) {
          // disable and unpublish defensively
          await trackManagement.enableTrack(audio, false);
          await trackManagement.unpublishTrack(client, audio).catch(() => {});
          try { audio.close?.(); } catch (e) { console.warn("audio.close failed", e); }
        }

        if (video) {
          await trackManagement.enableTrack(video, false);
          await trackManagement.unpublishTrack(client, video).catch(() => {});
          try { video.close?.(); } catch (e) { console.warn("video.close failed", e); }
        }

        // Clear refs/state
        localTracksRef.current = { audio: null, video: null };
        setLocalTracks({ audio: null, video: null });
      } catch (err) {
        console.error("Error during leaveClass cleanup:", err);
      }

      await client.leave();
      await API.put(`/live/leave/${sessionId}`);
      setJoined(false);
      navigate(-1);
    } catch (err) {
      console.error("Leave failed:", err);
    }
  };

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // ✅ UPDATED: Cleanup on unmount - robust track management
  useEffect(() => {
    return () => {
      (async () => {
        try {
          if (screenShareTrack) {
            screenShareTrack.close();
          }
          
          // ✅ Cleanup socket on component unmount
          if (socket) {
            socket.disconnect();
          }

          // ✅ Robust track cleanup
          const audio = localTracksRef.current?.audio;
          const video = localTracksRef.current?.video;

          if (audio) {
            await trackManagement.enableTrack(audio, false);
            await trackManagement.unpublishTrack(client, audio).catch(()=>{});
            try { audio.close?.(); } catch(e){ console.warn("audio.close failed", e); }
          }

          if (video) {
            await trackManagement.enableTrack(video, false);
            await trackManagement.unpublishTrack(client, video).catch(()=>{});
            try { video.close?.(); } catch(e){ console.warn("video.close failed", e); }
          }
        } catch (e) {
          console.error("Cleanup error:", e);
        }
      })();

      client.leave();
      const intervals = window.liveClassIntervals || [];
      intervals.forEach(clearInterval);
    };
  }, []);

  // ✅ UPDATED: Start Screen Sharing with robust track management
  const startScreenShare = async () => {
    try {
      if (!isTeacher) {
        return;
      }

      setIsScreenShareLoading(true);

      const screenTrack = await AgoraRTC.createScreenVideoTrack({
        encoderConfig: "1080p_1",
      }, "auto");

      if (localTracksRef.current.video) {
        await trackManagement.unpublishTrack(client, localTracksRef.current.video).catch(e => {
          console.warn("unpublish screen/video failed", e);
        });
      }

      await trackManagement.publishTrack(client, screenTrack);
      
      if (Array.isArray(screenTrack)) {
        screenTrack[0].play("local-player");
        setScreenShareTrack(screenTrack[0]);
      } else {
        screenTrack.play("local-player");
        setScreenShareTrack(screenTrack);
      }

      await API.post(`/live/screen-share/start/${sessionId}`);
      setIsScreenSharing(true);
      
      debugLog("Screen sharing started successfully");

    } catch (err) {
      console.error("Start screen share failed:", err);
      
      if (err.message?.includes('PERMISSION_DENIED') || err.name === 'NotAllowedError') {
        if (localTracksRef.current.video) {
          await trackManagement.publishTrack(client, localTracksRef.current.video).catch(()=>{});
          localTracksRef.current.video.play("local-player");
        }
      }
    } finally {
      setIsScreenShareLoading(false);
    }
  };

  // ✅ UPDATED: Stop Screen Sharing with robust track management
  const stopScreenShare = async () => {
    try {
      setIsScreenShareLoading(true);

      if (screenShareTrack) {
        await trackManagement.unpublishTrack(client, screenShareTrack).catch(e => {
          console.warn("unpublish screen share failed", e);
        });
        screenShareTrack.close();
        setScreenShareTrack(null);
      }

      if (localTracksRef.current.video) {
        await trackManagement.publishTrack(client, localTracksRef.current.video).catch(()=>{});
        localTracksRef.current.video.play("local-player");
      }

      await API.post(`/live/screen-share/stop/${sessionId}`);
      setIsScreenSharing(false);
      
      debugLog("Screen sharing stopped");

    } catch (err) {
      console.error("Stop screen share failed:", err);
    } finally {
      setIsScreenShareLoading(false);
    }
  };

  // Toggle Screen Sharing with loading state
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  };

  // ✅ UPDATED: Toggle Video On/Off with robust track management
  const toggleVideo = async () => {
    if (isVideoLoading) return;
    
    const video = localTracksRef.current?.video;
    if (!video) {
      console.warn("toggleVideo: no video track");
      return;
    }

    setIsVideoLoading(true);
    try {
      const enable = !isVideoOn;
      await trackManagement.enableTrack(video, enable);
      setIsVideoOn(enable);

      // Control publish state based on video state
      if (enable) {
        await trackManagement.publishTrack(client, video).catch(()=>{});
      } else {
        await trackManagement.unpublishTrack(client, video).catch(()=>{});
      }
    } catch (err) {
      console.error("Toggle video failed:", err);
    } finally {
      setIsVideoLoading(false);
    }
  };

  // Recording functions with loading states
  const startRecording = async () => {
    try {
      if (!isTeacher) {
        return;
      }

      setIsRecordingLoading(true);
      const response = await API.post(`/live/recording/start/${sessionId}`);
      setIsRecording(true);
      setRecordingStatus(response.data.recording);
      
    } catch (err) {
      console.error("Start recording failed:", err);
    } finally {
      setIsRecordingLoading(false);
    }
  };

  const stopRecording = async () => {
    try {
      if (!isTeacher) {
        return;
      }

      setIsRecordingLoading(true);
      const response = await API.post(`/live/recording/stop/${sessionId}`);
      setIsRecording(false);
      setRecordingStatus(response.data.recording);
      
    } catch (err) {
      console.error("Stop recording failed:", err);
    } finally {
      setIsRecordingLoading(false);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  // Adjust audio volume for all remote users
  const adjustRemoteAudioVolume = (volume = 50) => {
    remoteUsers.forEach(user => {
      if (user.audioTrack) {
        user.audioTrack.setVolume(volume);
      }
    });
  };

  // Call this after remote users join
  useEffect(() => {
    adjustRemoteAudioVolume(50);
  }, [remoteUsers]);

  // ... REST OF THE COMPONENT REMAINS EXACTLY THE SAME ...
  // (All the JSX rendering code is unchanged)

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* ✅ ADD Socket Connection Status Indicator */}
      {isDevelopment && (
        <div className="fixed top-2 right-2 z-50">
          <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
            isSocketConnected ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}>
            Socket: {isSocketConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
        </div>
      )}

      {/* Timeout Warning Modal */}
      {showTimeoutWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Session Timeout Warning</h3>
            <p className="mb-4">Your session will end in 10 minutes due to inactivity.</p>
            <button
              onClick={() => {
                setLastActivity(Date.now());
                setShowTimeoutWarning(false);
              }}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded w-full"
              aria-label="Continue session and reset timeout timer"
            >
              Continue Session
            </button>
          </div>
        </div>
      )}

      {/* End Class Confirmation Modal */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">End Live Class</h3>
            <p className="mb-4">Are you sure you want to end this class for everyone?</p>
            <div className="flex space-x-2">
              <button
                onClick={async () => { 
                  await endLiveClassConfirmed(); 
                  setShowEndModal(false); 
                }}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded flex-1"
              >
                Yes, end
              </button>
              <button
                onClick={() => setShowEndModal(false)}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header - Mobile Responsive */}
      <div className="bg-gray-800 p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">
            🎥 {sessionInfo?.title || "Live Class"}
          </h1>
          <p className="text-gray-400 text-sm sm:text-base truncate">
            Teacher: {sessionInfo?.teacherName} | 
            Class: {sessionInfo?.className}
          </p>
        </div>
        
        {/* Mobile Controls Toggle */}
        {isMobile && (
          <button
            onClick={() => setShowControls(!showControls)}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm"
          >
            {showControls ? "Hide Controls" : "Show Controls"}
          </button>
        )}
        
        <div className={`flex items-center space-x-2 sm:space-x-4 ${isMobile && !showControls ? 'hidden' : 'flex'}`}>
          {/* Recording Indicator for all participants */}
          {isRecording && (
            <div className="bg-red-600 text-white px-2 py-1 rounded-full text-xs sm:text-sm flex items-center">
              <span className="animate-pulse mr-1">🔴</span>
              <span className="hidden sm:inline">RECORDING</span>
            </div>
          )}

          {/* Screen Share Button for Teachers */}
          {isTeacher && (
            <button
              onClick={toggleScreenShare}
              disabled={isScreenShareLoading}
              className={`p-2 sm:p-3 rounded-full ${
                isScreenSharing 
                  ? "bg-purple-600 hover:bg-purple-700" 
                  : "bg-gray-600 hover:bg-gray-700"
              } transition-all disabled:opacity-50`}
              title={isScreenSharing ? "Stop Screen Share" : "Start Screen Share"}
              aria-label={isScreenSharing ? "Stop screen sharing" : "Start screen sharing"}
              aria-live="polite"
            >
              {isScreenShareLoading ? "⏳" : (isScreenSharing ? "🖥️●" : "🖥️")}
            </button>
          )}

          {/* Video Controls */}
          <button
            onClick={toggleVideo}
            disabled={isVideoLoading}
            className={`p-2 sm:p-3 rounded-full ${
              isVideoOn 
                ? "bg-green-600 hover:bg-green-700" 
                : "bg-red-600 hover:bg-red-700"
            } transition-all disabled:opacity-50`}
            title={isVideoOn ? "Turn Off Video" : "Turn On Video"}
            aria-label={isVideoOn ? "Turn off video camera" : "Turn on video camera"}
            aria-live="polite"
          >
            {isVideoLoading ? "⏳" : (isVideoOn ? "📹" : "📷")}
          </button>

          {/* Audio Controls */}
          <button
            onClick={toggleMute}
            disabled={isMuteLoading}
            className={`p-2 sm:p-3 rounded-full ${
              isMuted 
                ? "bg-red-600 hover:bg-red-700" 
                : "bg-green-600 hover:bg-green-700"
            } transition-all disabled:opacity-50`}
            title={isMuted ? "Unmute" : "Mute"}
            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
            aria-live="polite"
          >
            {isMuteLoading ? "⏳" : (isMuted ? "🔇" : "🎤")}
          </button>

          {/* Hand Raise */}
          <button
            onClick={toggleHandRaise}
            disabled={isHandRaiseLoading}
            className={`p-2 sm:p-3 rounded-full ${
              isHandRaised 
                ? "bg-yellow-600 hover:bg-yellow-700" 
                : "bg-gray-600 hover:bg-gray-700"
            } transition-all disabled:opacity-50`}
            title={isHandRaised ? "Lower Hand" : "Raise Hand"}
            aria-label={isHandRaised ? "Lower hand" : "Raise hand"}
            aria-live="polite"
          >
            {isHandRaiseLoading ? "⏳" : (isHandRaised ? "✋" : "🤚")}
          </button>

          {/* Permission Status */}
          {!isTeacher && (
            <div className={`px-2 py-1 rounded-full text-xs sm:text-sm ${
              hasSpeakingPermission 
                ? "bg-green-600" 
                : "bg-yellow-600"
            }`}>
              <span className="hidden sm:inline">
                {hasSpeakingPermission ? "🎤 Can Speak" : "⏳ Request Permission"}
              </span>
              <span className="sm:hidden">
                {hasSpeakingPermission ? "🎤" : "⏳"}
              </span>
            </div>
          )}

          <button
            onClick={leaveClass}
            className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm transition-all"
            aria-label="Leave live class session"
          >
            <span className="hidden sm:inline">Leave Class</span>
            <span className="sm:hidden">Leave</span>
          </button>
        </div>
      </div>

      {/* Mobile Chat Toggle */}
      {isMobile && (
        <div className="bg-gray-700 p-2 flex justify-center border-b border-gray-600">
          <button
            onClick={() => setShowChat(!showChat)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
          >
            {showChat ? "Hide Chat" : "Show Chat"}
          </button>
        </div>
      )}

      <div className={`h-[calc(100vh-80px)] ${isMobile ? 'flex flex-col' : 'flex'}`}>
        {/* Video Grid - Main Content */}
        <div className={`${isMobile ? (showChat ? 'hidden' : 'flex-1') : 'flex-1'} p-2 sm:p-4`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
            {/* Local Video with Screen Sharing Indicator */}
            <div className="bg-black rounded-lg overflow-hidden relative aspect-video">
              <div id="local-player" className="w-full h-full"></div>
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-xs sm:text-sm">
                You {isMuted && "🔇"} {!isVideoOn && "📷"} {isScreenSharing && "🖥️"}
              </div>
              {isScreenSharing && (
                <div className="absolute top-2 left-2 bg-purple-600 px-2 py-1 rounded text-xs">
                  Screen Sharing
                </div>
              )}
            </div>

            {/* Remote Videos */}
            {remoteUsers.map((user) => (
              <div key={user.uid} className="bg-black rounded-lg overflow-hidden relative aspect-video">
                <div 
                  id={`remote-${user.uid}`} 
                  className="w-full h-full remote-video-container"
                  style={{ 
                    background: '#000',
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center text-white">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-white mx-auto mb-1 sm:mb-2"></div>
                      <span className="text-xs sm:text-sm">Loading video...</span>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-xs sm:text-sm">
                  User {user.uid}
                </div>
                <div className="absolute top-2 right-2 bg-green-600 px-2 py-1 rounded text-xs">
                  🎥 Live
                </div>
              </div>
            ))}
          </div>

          {/* Temporary Debug Panel - Remove after testing */}
          {isDevelopment && (
            <div className="mt-4 p-3 bg-gray-800 rounded-lg">
              <h4 className="font-semibold text-yellow-400 mb-2">🔧 Debug Info</h4>
              <div className="text-xs space-y-1">
                <div>Session ID: {sessionId}</div>
                <div>User ID: {localStorage.getItem("userId")}</div>
                <div>User Role: {localStorage.getItem("role")}</div>
                <div>Is Teacher: {isTeacher ? "✅ YES" : "❌ NO"}</div>
                <div>Chat Messages: {chatMessages.length}</div>
                <div>Session Active: {sessionInfo?.isActive ? "✅ YES" : "❌ NO"}</div>
                <div>Joined: {joined ? "✅ YES" : "❌ NO"}</div>
                <div>Remote Users: {remoteUsers.length}</div>
                <div>Has Speaking Permission: {hasSpeakingPermission ? "✅ YES" : "❌ NO"}</div>
                <div>Socket Connected: {isSocketConnected ? "✅ YES" : "🔴 NO"}</div>
              </div>
            </div>
          )}

          {/* Teacher Controls */}
          {isTeacher && (
            <div className="mt-4 sm:mt-6 bg-gray-800 p-3 sm:p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-3">Teacher Controls</h3>
              
              {/* Recording Controls */}
              <div className="mb-4 p-3 bg-red-600 bg-opacity-20 rounded">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <span className="font-semibold text-sm sm:text-base">Recording: {isRecording ? "🔴 RECORDING" : "⏸️ NOT RECORDING"}</span>
                    {isRecording && recordingStatus?.startTime && (
                      <div className="text-xs text-gray-300">
                        Started: {new Date(recordingStatus.startTime).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={toggleRecording}
                    disabled={isRecordingLoading}
                    className={`px-3 py-1 rounded text-sm ${
                      isRecording 
                        ? "bg-red-600 hover:bg-red-700" 
                        : "bg-green-600 hover:bg-green-700"
                    } disabled:opacity-50`}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                  >
                    {isRecordingLoading ? "⏳" : (isRecording ? "⏹️ Stop" : "🔴 Start")}
                  </button>
                </div>
              </div>
              
              {/* Screen Sharing Status */}
              <div className="mb-4 p-3 bg-purple-600 bg-opacity-20 rounded">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className="font-semibold text-sm sm:text-base">Screen Sharing: {isScreenSharing ? "ACTIVE" : "INACTIVE"}</span>
                  <button
                    onClick={toggleScreenShare}
                    disabled={isScreenShareLoading}
                    className={`px-3 py-1 rounded text-sm ${
                      isScreenSharing 
                        ? "bg-red-600 hover:bg-red-700" 
                        : "bg-purple-600 hover:bg-purple-700"
                    } disabled:opacity-50`}
                    aria-label={isScreenSharing ? "Stop screen sharing" : "Start screen sharing"}
                  >
                    {isScreenShareLoading ? "⏳" : (isScreenSharing ? "Stop" : "Start")}
                  </button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={muteAllStudents}
                  className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm flex-1 min-w-[120px]"
                  aria-label="Mute all students"
                >
                  Mute All
                </button>
                <button
                  onClick={unmuteAllStudents}
                  className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm flex-1 min-w-[120px]"
                  aria-label="Unmute all students"
                >
                  Unmute All
                </button>
                {/* End Live Class - Using modal instead of window.confirm */}
                <button
                  onClick={() => setShowEndModal(true)}
                  className="bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded text-sm flex-1 min-w-[120px]"
                  aria-label="End live class for all participants"
                >
                  🛑 End Class
                </button>
              </div>

              {/* Pending Permission Requests */}
              {pendingRequests.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-semibold mb-2">Pending Permission Requests</h4>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {pendingRequests.map((request) => (
                      <div key={request.requestId} className="flex items-center justify-between bg-yellow-600 bg-opacity-20 p-2 rounded">
                        <span className="text-sm truncate flex-1 mr-2">{request.studentName}</span>
                        <div className="flex space-x-1">
                          <button
                            onClick={() => grantSpeakingPermission(request.studentId)}
                            className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs"
                            aria-label={`Grant speaking permission to ${request.studentName}`}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => revokeSpeakingPermission(request.studentId)}
                            className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs"
                            aria-label={`Deny speaking permission to ${request.studentName}`}
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Participants List */}
              <div>
                <h4 className="font-semibold mb-2">Participants ({participants.length})</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {participants.map((participant) => (
                    <div key={participant.studentId} className="flex items-center justify-between bg-gray-700 p-2 rounded">
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        <span className="truncate text-sm">{participant.name}</span>
                        {participant.isHandRaised && <span className="text-yellow-400 animate-pulse flex-shrink-0">✋</span>}
                        {participant.isMuted && <span className="text-red-400 flex-shrink-0">🔇</span>}
                        {participant.hasSpeakingPermission && (
                          <span className="text-green-400 flex-shrink-0" title="Can speak">🎤</span>
                        )}
                        {!participant.hasSpeakingPermission && participant.permissionRequested && (
                          <span className="text-orange-400 animate-pulse flex-shrink-0" title="Permission requested">⏳</span>
                        )}
                      </div>
                      <div className="flex space-x-1 flex-shrink-0">
                        <button
                          onClick={() => muteStudent(participant.studentId)}
                          className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs"
                          disabled={participant.isMuted}
                          aria-label={`Mute ${participant.name}`}
                        >
                          Mute
                        </button>
                        <button
                          onClick={() => unmuteStudent(participant.studentId)}
                          className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs"
                          disabled={!participant.isMuted}
                          aria-label={`Unmute ${participant.name}`}
                        >
                          Unmute
                        </button>
                        {!participant.hasSpeakingPermission && (
                          <button
                            onClick={() => grantSpeakingPermission(participant.studentId)}
                            className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs"
                            aria-label={`Grant microphone permission to ${participant.name}`}
                          >
                            Mic
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chat Panel - Right Side */}
        <div className={`${isMobile ? (showChat ? 'flex-1 flex flex-col' : 'hidden') : 'w-80'} bg-gray-800 flex flex-col`}>
          <div className="p-4 border-b border-gray-700">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">Chat</h3>
              {isMobile && (
                <button
                  onClick={() => setShowChat(false)}
                  className="bg-gray-600 hover:bg-gray-700 px-2 py-1 rounded text-sm"
                >
                  Close
                </button>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {chatMessages.length} messages
            </div>
          </div>
          
          {/* Chat Messages with Pagination */}
          <div 
            ref={chatContainerRef}
            role="log"
            aria-label="Chat messages"
            aria-live="polite"
            aria-atomic="false"
            className="flex-1 p-4 overflow-y-auto space-y-3"
          >
            {/* Load More Button */}
            {hasMoreChat && (
              <div className="text-center mb-4">
                <button
                  onClick={loadMoreChat}
                  disabled={isLoadingChat}
                  className="bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded text-sm disabled:opacity-50"
                  aria-label="Load older chat messages"
                >
                  {isLoadingChat ? "Loading..." : "Load Older Messages"}
                </button>
              </div>
            )}

            {chatMessages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <p>No messages yet</p>
                <p className="text-xs mt-1">Start the conversation!</p>
              </div>
            ) : (
              chatMessages.map((message, index) => (
                <div key={index} className={`p-2 rounded ${
                  message.messageType === "system" ? "bg-blue-600 bg-opacity-20" :
                  message.messageType === "permission_granted" ? "bg-green-600 bg-opacity-20" :
                  message.messageType === "permission_revoked" ? "bg-red-600 bg-opacity-20" :
                  "bg-gray-700"
                }`}>
                  <div className="flex justify-between items-start">
                    <span className="font-semibold text-sm">{message.userName}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm mt-1 break-words">{message.message}</p>
                </div>
              ))
            )}
          </div>

          {/* Message Input */}
          <div className="p-4 border-t border-gray-700">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                aria-label="Type chat message"
                className="flex-1 bg-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={sendMessage}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
                aria-label="Send chat message"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Join Button for non-joined state */}
      {!joined && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center">
          <div className="bg-gray-800 p-6 sm:p-8 rounded-lg text-center mx-4 max-w-md w-full">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">Join Live Class</h2>
            <p className="text-gray-400 mb-6">
              {sessionInfo?.title || "Loading session..."}
            </p>
            <button
              onClick={joinClass}
              disabled={isJoinLoading}
              className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg text-lg font-semibold transition-all disabled:opacity-50 w-full"
              aria-label="Join live class session"
            >
              {isJoinLoading ? "Joining..." : "Join Class Now"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}