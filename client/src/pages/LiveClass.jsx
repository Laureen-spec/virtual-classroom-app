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
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [participants, setParticipants] = useState([]);
  const [isTeacher, setIsTeacher] = useState(false);

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

  // ✅ ADD: Debug mute state changes
  useEffect(() => {
    console.log("🎧 MUTE STATE CHANGED:", {
      isMuted,
      hasAudioTrack: !!localTracksRef.current?.audio,
      audioEnabled: localTracksRef.current?.audio?.enabled,
      userRole: localStorage.getItem("role")
    });
  }, [isMuted]);

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

  // ✅ ADD: Socket-based real-time updates to reduce polling
  useEffect(() => {
    if (!socket) return;

    // Real-time participant updates
    socket.on("participant-updated", (data) => {
      setParticipants(prev => prev.map(p => 
        p.studentId === data.studentId ? { ...p, ...data } : p
      ));
    });

    // Real-time chat messages
    socket.on("new-chat-message", (message) => {
      setChatMessages(prev => [...prev, message]);
    });

    // Real-time session updates
    socket.on("session-updated", (sessionData) => {
      if (sessionData.isActive === false) {
        debugLog("Session ended via socket");
        leaveClass();
      }
    });

    return () => {
      socket.off("participant-updated");
      socket.off("new-chat-message");
      socket.off("session-updated");
    };
  }, [socket]);

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

  // ✅ UPDATED: Enhanced toggle mute function - STUDENTS CAN ALWAYS MUTE/UNMUTE (FIXED)
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
        // ✅ UNMUTE: Enable audio track and publish
        debugLog("🎤 Unmuting...");
        await API.put(`/live/self-unmute/${sessionId}`);
        
        // ✅ PHYSICALLY ENABLE AUDIO TRACK
        trackManagement.enableTrack(audio, true);
        setIsMuted(false);
        
        // ✅ REPUBLISH AUDIO TRACK
        await trackManagement.publishTrack(client, audio).catch(()=>{});
        debugLog("✅ Successfully unmuted - audio track enabled and published");
        
      } else {
        // ✅ MUTE: Disable audio track and unpublish  
        debugLog("🔇 Muting...");
        await API.put(`/live/self-mute/${sessionId}`);
        
        // ✅ PHYSICALLY DISABLE AUDIO TRACK
        trackManagement.enableTrack(audio, false);
        setIsMuted(true);
        
        // ✅ UNPUBLISH AUDIO TRACK
        await trackManagement.unpublishTrack(client, audio).catch(()=>{});
        debugLog("✅ Successfully muted - audio track disabled and unpublished");
      }
    } catch (err) {
      console.error("❌ Toggle mute failed:", err);
    } finally {
      setIsMuteLoading(false);
    }
  };

  // ✅ OPTIMIZED: Reduced API calls on join
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

      // ✅ SINGLE API CALL for join (removed redundant session fetch)
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
      
      // Use participantInfo directly instead of fetching session again
      setSessionInfo(session);
      setParticipantInfo(participantInfo);
      
      // ✅ Use participantInfo for initial state instead of extra API call
      setIsMuted(actualIsMuted);
      
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

      // ✅ OPTIMIZED: Use participantInfo for initial audio state
      if (actualIsMuted) {
        await audioTrack.setEnabled(false);
        await trackManagement.unpublishTrack(client, audioTrack).catch(()=>{});
        console.log("🔇 Joined muted - audio disabled");
      } else {
        await audioTrack.setEnabled(true);
        await trackManagement.publishTrack(client, audioTrack).catch(()=>{});
        console.log("🎤 Joined unmuted - audio enabled");
      }

      // ✅ DELAYED POLLING: Start polling only when truly needed
      setTimeout(() => {
        if (audioTrack && videoTrack) {
          startSessionPolling();
        }
      }, 10000); // Start polling after 10 seconds

      // Publish video track
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

  // Debug audio state
  useEffect(() => {
    debugLog("🎧 Audio state:", { isMuted });
  }, [isMuted]);

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

  // ✅ OPTIMIZED: Reduced polling and smart intervals
  const startSessionPolling = () => {
    debugLog("Starting OPTIMIZED session polling...");
    
    let isPolling = false;
    let pollCount = 0;
    const MAX_POLLS = 50; // Limit total polls
    const LONG_INTERVAL = 15000; // 15 seconds after first 2 minutes
    const SHORT_INTERVAL = 5000; // 5 seconds initially
    
    let currentInterval = SHORT_INTERVAL;
    
    const interval = setInterval(async () => {
      if (!sessionId || isPolling || pollCount >= MAX_POLLS) {
        if (pollCount >= MAX_POLLS) {
          debugLog("🛑 Max polls reached, stopping polling");
          clearInterval(interval);
        }
        return;
      }
      
      pollCount++;
      
      // Switch to longer interval after initial phase
      if (pollCount > 24) { // After 2 minutes (24 * 5s = 120s)
        currentInterval = LONG_INTERVAL;
      }
      
      isPolling = true;
      
      try {
        const response = await API.get(`/live/session/${sessionId}`);
        
        if (!response.data) {
          debugLog("No data in polling response");
          isPolling = false;
          return;
        }

        const { participants, chatMessages, isActive } = response.data;

        // Stop if session ended
        if (isActive === false) {
          debugLog("Session has ended - stopping polling");
          clearInterval(interval);
          isPolling = false;
          return;
        }
        
        // Only update if data actually changed
        if (participants && Array.isArray(participants)) {
          setParticipants(prev => {
            if (JSON.stringify(prev) !== JSON.stringify(participants)) {
              return participants;
            }
            return prev;
          });
        }
        
        // Only update chat if new messages
        if (chatMessages && Array.isArray(chatMessages)) {
          setChatMessages(prev => {
            if (prev.length !== chatMessages.length) {
              debugLog("New chat messages detected:", chatMessages.length);
              return chatMessages;
            }
            return prev;
          });
        }

        // Sync mute state only when needed
        const currentUserId = String(localStorage.getItem("userId") || "");
        if (participants && currentUserId) {
          const currentParticipant = participants.find(p => String(p.studentId) === currentUserId);
          if (currentParticipant && currentParticipant.isMuted !== isMuted) {
            debugLog(`Mute state sync via polling`);
            setIsMuted(currentParticipant.isMuted);
            
            if (localTracksRef.current.audio) {
              trackManagement.enableTrack(localTracksRef.current.audio, !currentParticipant.isMuted);
            }
          }
        }

      } catch (err) {
        console.error("Polling error:", err);
        // On error, increase interval to reduce load
        currentInterval = 30000; // 30 seconds on error
      } finally {
        isPolling = false;
      }
    }, currentInterval);

    return () => {
      debugLog("Clearing optimized polling interval");
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

              {/* ✅ UPDATED: Quick Actions - Remove Mute/Unmute All buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                {/* Keep only these buttons - remove mute controls */}
                <button
                  onClick={() => {
                    // Manual refresh instead of constant polling
                    API.get(`/live/session/${sessionId}`)
                      .then(response => {
                        if (response.data.participants) {
                          setParticipants(response.data.participants);
                        }
                      })
                      .catch(err => console.error("Manual refresh failed:", err));
                  }}
                  className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm flex-1 min-w-[120px]"
                >
                  🔄 Refresh
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

              {/* ✅ UPDATED: Participants List - Remove mute/unmute buttons */}
              <div>
                <h4 className="font-semibold mb-2">Participants ({participants.length})</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {participants.map((participant) => (
                    // ✅ REPLACE with Simple Status Display
                    <div key={participant.studentId} className="flex items-center justify-between bg-gray-700 p-2 rounded">
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        <span className="truncate text-sm">
                          {participant.name} 
                          {participant.role === "host" && " 👨‍🏫"}
                        </span>
                        {participant.isHandRaised && <span className="text-yellow-400 animate-pulse flex-shrink-0">✋</span>}
                        {participant.isMuted && <span className="text-red-400 flex-shrink-0">🔇</span>}
                        {!participant.isMuted && participant.role !== "host" && <span className="text-green-400 flex-shrink-0">🎤</span>}
                      </div>
                      {/* ❌ NO BUTTONS - Just status indicators */}
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