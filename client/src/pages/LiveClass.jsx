import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AgoraRTC from "agora-rtc-sdk-ng";
import API from "../api/axios";

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

  const appId = import.meta.env.VITE_AGORA_APP_ID;
  const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  const chatContainerRef = useRef(null);

  // Track management utilities
  const trackManagement = {
    publishTrack: async (client, track) => {
      try {
        await client.publish(track);
        console.log(`✅ ${track.getTrackLabel()} published successfully`);
        return true;
      } catch (error) {
        console.error(`❌ Error publishing ${track.getTrackLabel()}:`, error);
        return false;
      }
    },
    
    unpublishTrack: async (client, track) => {
      try {
        await client.unpublish(track);
        console.log(`✅ ${track.getTrackLabel()} unpublished successfully`);
        return true;
      } catch (error) {
        console.error(`❌ Error unpublishing ${track.getTrackLabel()}:`, error);
        return false;
      }
    },
    
    enableTrack: (track, enabled) => {
      if (track) {
        track.setEnabled(enabled);
        console.log(`✅ ${track.getTrackLabel()} ${enabled ? 'enabled' : 'disabled'}`);
      }
    }
  };

  // Production mode check and conditional logging
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const debugLog = (...args) => {
    if (isDevelopment) {
      console.log(...args);
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
    const CHECK_INTERVAL = 30000; // 30 seconds
    const WARNING_TIME = 1200000; // 20 minutes
    const TIMEOUT_TIME = 1800000; // 30 minutes

    const interval = setInterval(() => {
      const inactiveTime = Date.now() - lastActivity;
      
      if (inactiveTime > TIMEOUT_TIME && joined) {
        // Auto-leave after 30 minutes of inactivity
        leaveClass();
        alert("Session ended due to inactivity");
      } else if (inactiveTime > WARNING_TIME && !showTimeoutWarning && joined) {
        // Show warning after 20 minutes
        setShowTimeoutWarning(true);
      }
    }, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [lastActivity, showTimeoutWarning, joined]);

  // Enhanced network monitoring with reconnection
  useEffect(() => {
    const handleOnline = () => {
      console.log("🌐 Network back online - attempting to reconnect...");
      // Attempt to restore connection
      if (joined) {
        setTimeout(() => {
          fetchActiveSessions();
        }, 2000);
      }
    };
    
    const handleOffline = () => {
      console.log("🌐 Network offline - audio/video may be affected");
      alert("Network connection lost. Trying to reconnect...");
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
      if (localTracks.audio && hasSpeakingPermission) {
        debugLog("🎯 Republishing audio track after permission grant");
        
        // Use track management utility
        await trackManagement.unpublishTrack(client, localTracks.audio);
        
        // Re-enable the audio track
        trackManagement.enableTrack(localTracks.audio, true);
        
        // Republish the audio track
        await trackManagement.publishTrack(client, localTracks.audio);
        
        debugLog("✅ Audio track republished successfully after permission grant");
      }
    } catch (error) {
      console.error("❌ Error forcing audio update:", error);
    }
  };

  // Function to handle video track updates
  const forceVideoUpdate = async () => {
    try {
      if (localTracks.video && hasSpeakingPermission) {
        // Republish video track to ensure it's available to others
        await trackManagement.unpublishTrack(client, localTracks.video);
        await trackManagement.publishTrack(client, localTracks.video);
        debugLog("✅ Video track republished after permission grant");
      }
    } catch (error) {
      console.error("❌ Error forcing video update:", error);
    }
  };

  // Debug audio state
  useEffect(() => {
    debugLog("🎧 Audio state:", { isMuted, hasSpeakingPermission });
  }, [isMuted, hasSpeakingPermission]);

  // Enhanced toggle mute function with loading state and track utilities
  const toggleMute = async () => {
    if (!localTracks.audio || isMuteLoading) return;

    setIsMuteLoading(true);
    try {
      if (isMuted) {
        // If muted and trying to unmute
        if (!hasSpeakingPermission) {
          debugLog("🔔 No speaking permission - requesting...");
          await requestSpeakingPermission();
        } else {
          // If we have permission, proceed with unmute
          debugLog("🎤 Unmuting with permission...");
          await API.put(`/live/self-unmute/${sessionId}`);
          trackManagement.enableTrack(localTracks.audio, true);
          setIsMuted(false);
          debugLog("✅ Successfully unmuted");
        }
      } else {
        // Muting is always allowed
        debugLog("🔇 Muting...");
        await API.put(`/live/self-mute/${sessionId}`);
        trackManagement.enableTrack(localTracks.audio, false);
        setIsMuted(true);
        debugLog("✅ Successfully muted");
      }
    } catch (err) {
      console.error("❌ Toggle mute failed:", err);
      alert(err.response?.data?.message || "Failed to toggle audio");
    } finally {
      setIsMuteLoading(false);
    }
  };

  // Function to handle immediate permission updates
  const handleImmediatePermissionUpdate = async (studentId, hasPermission) => {
    try {
      // Force update the participants list
      const sessionResponse = await API.get(`/live/session/${sessionId}`);
      if (sessionResponse.data.participants) {
        setParticipants(sessionResponse.data.participants);
      }
      
      // If it's the current user, force audio update
      if (studentId === localStorage.getItem("userId") && hasPermission && localTracks.audio) {
        debugLog("🎯 Immediate audio update for permission grant");
        trackManagement.enableTrack(localTracks.audio, true);
        setIsMuted(false);
        
        // Republish audio track
        setTimeout(async () => {
          try {
            await trackManagement.unpublishTrack(client, localTracks.audio);
            await trackManagement.publishTrack(client, localTracks.audio);
            debugLog("✅ Audio track immediately republished");
          } catch (error) {
            console.error("❌ Immediate audio republish failed:", error);
          }
        }, 100);
      }
    } catch (error) {
      console.error("❌ Immediate permission update failed:", error);
    }
  };

  // UPDATED: Grant speaking permission with immediate effect
  const grantSpeakingPermission = async (studentId) => {
    try {
      debugLog("Granting permission to:", studentId);
      const response = await API.put(`/live/grant-speaking/${sessionId}/${studentId}`);

      // Update UI immediately (remove request)
      setPendingRequests(prev => prev.filter(req => req.studentId !== studentId));

      // Update participants list from response if provided, else fetch session
      if (response.data?.participant) {
        setParticipants(prev => {
          const other = prev.filter(p => p.studentId !== response.data.participant.studentId);
          return [...other, {
            studentId: response.data.participant.studentId,
            isMuted: response.data.participant.isMuted,
            hasSpeakingPermission: response.data.participant.hasSpeakingPermission,
            permissionRequested: response.data.participant.permissionRequested,
            role: response.data.participant.role
          }];
        });
      } else {
        const sessionResponse = await API.get(`/live/session/${sessionId}`);
        if (sessionResponse.data.participants) setParticipants(sessionResponse.data.participants);
      }

      // If the granted student is the current user, immediately enable audio & republish
      const currentUserId = localStorage.getItem("userId");
      if (studentId === currentUserId) {
        setHasSpeakingPermission(true);
        setIsMuted(false);
        if (localTracks.audio) {
          // enable locally then republish to ensure Agora updates subscribers
          trackManagement.enableTrack(localTracks.audio, true);
          // republish to force remote clients to receive audio
          try {
            await trackManagement.unpublishTrack(client, localTracks.audio);
            await trackManagement.publishTrack(client, localTracks.audio);
            debugLog("✅ Audio republished after permission grant (local user)");
          } catch (err) {
            console.error("Error republishing after grant:", err);
          }
        }
      }

    } catch (err) {
      console.error("❌ Grant permission failed:", err);
      alert(err.response?.data?.message || "Failed to grant permission");
    }
  };

  // UPDATED: Mute student with immediate effect
  const muteStudent = async (studentId) => {
    try {
      debugLog("Muting student:", studentId);
      const response = await API.put(`/live/mute/${sessionId}/${studentId}`, { mute: true });

      // Update participants from response if provided, else fetch
      if (response.data?.studentId) {
        setParticipants(prev => prev.map(p => p.studentId === response.data.studentId ? { ...p, isMuted: response.data.isMuted } : p));
      } else {
        const sessionResponse = await API.get(`/live/session/${sessionId}`);
        if (sessionResponse.data.participants) setParticipants(sessionResponse.data.participants);
      }

      // If the current user was muted by the teacher, disable local audio immediately
      const currentUserId = localStorage.getItem("userId");
      if (studentId === currentUserId) {
        setIsMuted(true);
        if (localTracks.audio) {
          trackManagement.enableTrack(localTracks.audio, false);
        }
      }

      debugLog("Student muted");
    } catch (err) {
      console.error("❌ Mute student failed:", err);
      alert(err.response?.data?.message || "Failed to mute student");
    }
  };

  // UPDATED: Unmute student with immediate effect
  const unmuteStudent = async (studentId) => {
    try {
      debugLog("Unmuting student:", studentId);
      const response = await API.put(`/live/mute/${sessionId}/${studentId}`, { mute: false });

      // Update participants list
      if (response.data?.studentId) {
        setParticipants(prev => prev.map(p => p.studentId === response.data.studentId ? { ...p, isMuted: response.data.isMuted } : p));
      } else {
        const sessionResponse = await API.get(`/live/session/${sessionId}`);
        if (sessionResponse.data.participants) setParticipants(sessionResponse.data.participants);
      }

      // If the current user was unmuted, enable audio immediately and republish
      const currentUserId = localStorage.getItem("userId");
      if (studentId === currentUserId) {
        setIsMuted(false);
        if (localTracks.audio) {
          trackManagement.enableTrack(localTracks.audio, true);
          // republish so remote subscribers hear immediately
          try {
            await trackManagement.unpublishTrack(client, localTracks.audio);
            await trackManagement.publishTrack(client, localTracks.audio);
            debugLog("✅ Local user audio republished after teacher unmute");
          } catch (err) {
            console.error("Error republishing after teacher unmute:", err);
          }
        }
      }

      debugLog("Student unmuted via API");
    } catch (err) {
      console.error("❌ Unmute student failed:", err);
      alert(err.response?.data?.message || "Failed to unmute student");
    }
  };

  // UPDATED: Mute all students with immediate effect
  const muteAllStudents = async () => {
    try {
      debugLog("Muting all students.");
      const response = await API.put(`/live/mute-all/${sessionId}`);

      // fetch session to update UI
      const sessionResponse = await API.get(`/live/session/${sessionId}`);
      if (sessionResponse.data.participants) setParticipants(sessionResponse.data.participants);

      // If current user is audience, ensure local audio disabled
      const currentUserId = localStorage.getItem("userId");
      const me = (sessionResponse.data.participants || []).find(p => p.studentId === currentUserId);
      if (me && me.isMuted && localTracks.audio) {
        setIsMuted(true);
        trackManagement.enableTrack(localTracks.audio, false);
      }
    } catch (err) {
      console.error("❌ Mute all failed:", err);
      alert(err.response?.data?.message || "Failed to mute all students");
    }
  };

  // UPDATED: Unmute all students with immediate effect
  const unmuteAllStudents = async () => {
    try {
      debugLog("Unmuting all students.");
      const response = await API.put(`/live/unmute-all/${sessionId}`);

      const sessionResponse = await API.get(`/live/session/${sessionId}`);
      if (sessionResponse.data.participants) setParticipants(sessionResponse.data.participants);

      // If current user now has speaking permission & unmuted, enable audio & republish
      const currentUserId = localStorage.getItem("userId");
      const me = (sessionResponse.data.participants || []).find(p => p.studentId === currentUserId);
      if (me && !me.isMuted && me.hasSpeakingPermission && localTracks.audio) {
        setIsMuted(false);
        trackManagement.enableTrack(localTracks.audio, true);
        try {
          await trackManagement.unpublishTrack(client, localTracks.audio);
          await trackManagement.publishTrack(client, localTracks.audio);
        } catch (err) {
          console.error("Error republishing after unmute all:", err);
        }
      }
    } catch (err) {
      console.error("❌ Unmute all failed:", err);
      alert(err.response?.data?.message || "Failed to unmute all students");
    }
  };

  // Start Screen Sharing with loading state and track utilities
  const startScreenShare = async () => {
    try {
      if (!isTeacher) {
        alert("Only teachers can share screen");
        return;
      }

      setIsScreenShareLoading(true);

      // Create screen share track
      const screenTrack = await AgoraRTC.createScreenVideoTrack({
        encoderConfig: "1080p_1",
      }, "auto");

      // Unpublish camera video first using track utility
      if (localTracks.video) {
        await trackManagement.unpublishTrack(client, localTracks.video);
      }

      // Publish screen share track using track utility
      await trackManagement.publishTrack(client, screenTrack);
      
      // Play screen share in local player
      if (Array.isArray(screenTrack)) {
        screenTrack[0].play("local-player");
        setScreenShareTrack(screenTrack[0]);
      } else {
        screenTrack.play("local-player");
        setScreenShareTrack(screenTrack);
      }

      // Update backend
      await API.post(`/live/screen-share/start/${sessionId}`);
      setIsScreenSharing(true);
      
      debugLog("Screen sharing started successfully");

    } catch (err) {
      console.error("Start screen share failed:", err);
      
      // If user cancels screen share picker, republish camera
      if (err.message?.includes('PERMISSION_DENIED') || err.name === 'NotAllowedError') {
        if (localTracks.video) {
          await trackManagement.publishTrack(client, localTracks.video);
          localTracks.video.play("local-player");
        }
      } else {
        alert("Failed to start screen sharing: " + (err.message || "Unknown error"));
      }
    } finally {
      setIsScreenShareLoading(false);
    }
  };

  // Stop Screen Sharing with loading state and track utilities
  const stopScreenShare = async () => {
    try {
      setIsScreenShareLoading(true);

      if (screenShareTrack) {
        // Unpublish screen share track using track utility
        await trackManagement.unpublishTrack(client, screenShareTrack);
        screenShareTrack.close();
        setScreenShareTrack(null);
      }

      // Republish camera video using track utility
      if (localTracks.video) {
        await trackManagement.publishTrack(client, localTracks.video);
        localTracks.video.play("local-player");
      }

      // Update backend
      await API.post(`/live/screen-share/stop/${sessionId}`);
      setIsScreenSharing(false);
      
      debugLog("Screen sharing stopped");

    } catch (err) {
      console.error("Stop screen share failed:", err);
      alert("Failed to stop screen sharing");
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

  // Toggle Video On/Off with loading state and track utilities
  const toggleVideo = async () => {
    if (!localTracks.video || isVideoLoading) return;

    setIsVideoLoading(true);
    try {
      const newVideoState = !isVideoOn;
      trackManagement.enableTrack(localTracks.video, newVideoState);
      setIsVideoOn(newVideoState);
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
        alert("Only teachers can start recording");
        return;
      }

      setIsRecordingLoading(true);
      const response = await API.post(`/live/recording/start/${sessionId}`);
      setIsRecording(true);
      setRecordingStatus(response.data.recording);
      alert("Recording started successfully!");
      
    } catch (err) {
      console.error("Start recording failed:", err);
      alert(err.response?.data?.message || "Failed to start recording");
    } finally {
      setIsRecordingLoading(false);
    }
  };

  const stopRecording = async () => {
    try {
      if (!isTeacher) {
        alert("Only teachers can stop recording");
        return;
      }

      setIsRecordingLoading(true);
      const response = await API.post(`/live/recording/stop/${sessionId}`);
      setIsRecording(false);
      setRecordingStatus(response.data.recording);
      alert("Recording stopped successfully! The recording will be available for playback.");
      
    } catch (err) {
      console.error("Stop recording failed:", err);
      alert(err.response?.data?.message || "Failed to stop recording");
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

  // Update recording status
  const updateRecordingStatus = async () => {
    try {
      const response = await API.get(`/live/recording/status/${sessionId}`);
      setRecordingStatus(response.data.recording);
      setIsRecording(response.data.recording.isRecording);
    } catch (err) {
      console.error("Error fetching recording status:", err);
    }
  };

  // IMPROVED: User published event handler with better stability and cleaned logs
  const handleUserPublished = async (user, mediaType) => {
    debugLog("User published:", user.uid, mediaType);
    
    try {
      await client.subscribe(user, mediaType);
      debugLog("Subscribed to user:", user.uid, "for", mediaType);
      
      // Add small delay for DOM stability
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
      
      // Update remote users state more carefully
      setRemoteUsers((prev) => {
        const existingUser = prev.find(u => u.uid === user.uid);
        if (existingUser) {
          // Update existing user
          return prev.map(u => u.uid === user.uid ? { ...u, ...user } : u);
        } else {
          // Add new user
          return [...prev, user];
        }
      });
      
    } catch (error) {
      console.error("❌ Error subscribing to user:", error);
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
    adjustRemoteAudioVolume(50); // Set to 50% volume
  }, [remoteUsers]);

  // Fetch session info and join class with cleaned logs and track utilities
  const joinClass = async () => {
    try {
      setIsJoinLoading(true);
      debugLog("Attempting to join class...");
      
      // SIMPLIFIED AUTH CHECK - Only check token
      const token = localStorage.getItem("token");
      
      if (!token) {
        console.error("❌ No authentication token found");
        alert("Please log in again");
        navigate("/register");
        return;
      }

      debugLog("Authentication token present");

      // CRITICAL FIX: Request microphone permission BEFORE joining
      try {
        debugLog("Requesting microphone permission...");
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: true 
        });
        debugLog("Microphone and camera access granted");
        // Stop the tracks immediately since we'll create proper ones with Agora
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.error("❌ Microphone/camera permission denied:", err);
        alert("Microphone and camera access is required to join the live class. Please allow permissions and try again.");
        return;
      }

      // Join the live session via backend
      const joinResponse = await API.post(`/live/join/${sessionId}`);
      debugLog("Join response received");
      
      const { session, token: agoraToken, participantInfo } = joinResponse.data;
      
      setSessionInfo(session);
      setParticipantInfo(participantInfo);
      setIsMuted(participantInfo.isMuted);
      setHasSpeakingPermission(participantInfo.hasSpeakingPermission);
      
      // IMPROVED ROLE DETECTION
      const userRole = localStorage.getItem("role");
      const isUserTeacher = participantInfo.role === "host" || userRole === "teacher" || userRole === "admin";
      setIsTeacher(isUserTeacher);
      
      debugLog("User role:", { isTeacher: isUserTeacher, participantRole: participantInfo.role });

      // Check if teacher is rejoining
      if (isUserTeacher && participantInfo.role === "host") {
        debugLog("Teacher/Admin rejoining live session");
      }

      // Join Agora channel
      const uid = await client.join(appId, session.channelName, agoraToken, null);

      // Create local tracks with audio optimization
      debugLog("Creating microphone and camera tracks...");
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
        {
          // Audio optimization to reduce echo
          AEC: true, // Acoustic Echo Cancellation
          ANS: true, // Automatic Noise Suppression  
          AGC: true, // Automatic Gain Control
          encoderConfig: {
            sampleRate: 48000,
            stereo: false,
            bitrate: 64
          }
        }, 
        {}
      );
      
      debugLog("Tracks created");

      // FIX: Always enable audio track initially, control via publishing
      trackManagement.enableTrack(audioTrack, true);
      debugLog("Audio track created and enabled");

      // Store mute state but don't disable track - control via Agora publishing
      setIsMuted(participantInfo.isMuted);

      setLocalTracks({ audio: audioTrack, video: videoTrack });
      videoTrack.play("local-player");

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

      // Add user-joined event to handle new participants
      client.on("user-joined", (user) => {
        debugLog("User joined:", user.uid);
      });

      client.on("user-left", (user) => {
        debugLog("User left:", user.uid);
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      });

      // Publish tracks using track utilities
      debugLog("Publishing audio and video tracks...");
      await trackManagement.publishTrack(client, audioTrack);
      await trackManagement.publishTrack(client, videoTrack);
      debugLog("Tracks published successfully");
      
      setJoined(true);

      // Start polling for session updates
      startSessionPolling();

    } catch (err) {
      console.error("❌ Join failed:", err);
      
      let errorMessage = "Failed to join class. Please try again.";
      
      if (err.response?.status === 401) {
        errorMessage = "Authentication failed. Please log in again.";
        navigate("/register");
      } else if (err.response?.status === 404) {
        errorMessage = "Live session not found or has ended.";
      } else if (err.response?.status === 403) {
        errorMessage = "You don't have permission to join this session.";
      } else if (err.name === 'NotAllowedError') {
        errorMessage = "Microphone and camera access is required. Please allow permissions and try again.";
      } else if (err.message?.includes('NETWORK_ERROR')) {
        errorMessage = "Network error. Please check your internet connection.";
      }
      
      alert(errorMessage);
    } finally {
      setIsJoinLoading(false);
    }
  };

  // IMPROVED: Poll for session updates with better stability and cleaned logs
  const startSessionPolling = () => {
    debugLog("Starting session polling...");
    
    let isPolling = false; // Prevent overlapping requests
    
    const interval = setInterval(async () => {
      if (!sessionId || isPolling) {
        return; // Skip if already polling or no session
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

        // Only update if session is active
        if (isActive === false) {
          debugLog("Session has ended - stopping updates");
          clearInterval(interval);
          isPolling = false;
          return;
        }
        
        // Update participants
        if (participants && Array.isArray(participants)) {
          setParticipants(participants);
        }
        
        // Update chat messages only if changed
        if (chatMessages && Array.isArray(chatMessages)) {
          setChatMessages(prev => {
            if (prev.length !== chatMessages.length) {
              debugLog("Chat messages updated:", chatMessages.length);
              return chatMessages;
            }
            return prev;
          });
        }
        
        // Update pending requests for teachers
        if (userPermissions?.isTeacher && permissionRequests) {
          const pending = permissionRequests.filter(req => req.status === "pending");
          setPendingRequests(pending);
        }

        // FIXED: More stable participant state updates
        const currentUserId = localStorage.getItem("userId");
        if (participants && currentUserId) {
          const currentParticipant = participants.find(p => p.studentId === currentUserId);
          if (currentParticipant) {
            // Update mute state only if changed
            if (currentParticipant.isMuted !== isMuted) {
              setIsMuted(currentParticipant.isMuted);
              if (localTracks.audio) {
                trackManagement.enableTrack(localTracks.audio, !currentParticipant.isMuted);
                debugLog(`Audio ${currentParticipant.isMuted ? 'muted' : 'unmuted'} via polling`);
              }
            }
            
            // Update permission state only if changed
            if (currentParticipant.hasSpeakingPermission !== hasSpeakingPermission) {
              setHasSpeakingPermission(currentParticipant.hasSpeakingPermission);
              
              // Only update audio if permission actually changed
              if (currentParticipant.hasSpeakingPermission && localTracks.audio) {
                trackManagement.enableTrack(localTracks.audio, true);
              }
            }
            
            // Update hand raise state
            if (currentParticipant.isHandRaised !== isHandRaised) {
              setIsHandRaised(currentParticipant.isHandRaised);
            }
          }
        }

      } catch (err) {
        console.error("❌ Polling error:", err);
      } finally {
        isPolling = false; // Reset polling flag
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
      alert("Speaking permission requested. Waiting for teacher approval.");
    } catch (err) {
      console.error("Request speaking permission failed:", err);
      alert(err.response?.data?.message || "Failed to request permission");
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

  // End Live Class (Teacher only) - Enhanced with better error handling
  const endLiveClass = async () => {
    if (!window.confirm("Are you sure you want to end this live class for everyone?")) return;

    try {
      debugLog("Attempting to end class...");
      const response = await API.put(`/live/end/${sessionId}`);
      debugLog("Class ended successfully");
      
      alert("Live class ended successfully.");
      
      // Redirect based on role
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
      alert(err.response?.data?.message || "Failed to end class. Please check if you're the teacher of this session.");
    }
  };

  // Leave class
  const leaveClass = async () => {
    try {
      // Stop screen sharing if active
      if (isScreenSharing) {
        await stopScreenShare();
      }
      
      localTracks.audio?.close();
      localTracks.video?.close();
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop screen sharing if active
      if (screenShareTrack) {
        screenShareTrack.close();
      }
      
      localTracks.audio?.close();
      localTracks.video?.close();
      client.leave();
      // Clear any polling intervals
      const intervals = window.liveClassIntervals || [];
      intervals.forEach(clearInterval);
    };
  }, []);

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Invalid Session</h2>
          <p className="text-gray-600">No live session specified.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
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

            {/* ENHANCED: Remote Videos with better loading states */}
            {remoteUsers.map((user) => (
              <div key={user.uid} className="bg-black rounded-lg overflow-hidden relative aspect-video">
                <div 
                  id={`remote-${user.uid}`} 
                  className="w-full h-full remote-video-container"
                  style={{ 
                    background: '#000',
                  }}
                >
                  {/* Add a loading indicator */}
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
                {/* Add video status indicator */}
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
                {/* End Live Class */}
                <button
                  onClick={endLiveClass}
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
          
          {/* UPDATED: Chat Messages with Pagination */}
          <div 
            ref={chatContainerRef}
            role="log"
            aria-label="Chat messages"
            aria-live="polite"
            aria-atomic="false"
            className="flex-1 p-4 overflow-y-auto space-y-3"
          >
            {/* NEW: Load More Button */}
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

          {/* UPDATED: Message Input with sanitization and ARIA labels */}
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