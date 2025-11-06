import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AgoraRTC from "agora-rtc-sdk-ng";
import API from "../api/axios";

export default function LiveClass() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [joined, setJoined] = useState(false);
  const [localTracks, setLocalTracks] = useState({ audioTrack: null, videoTrack: null });
  const localTracksRef = useRef({ audioTrack: null, videoTrack: null });
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [participantInfo, setParticipantInfo] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
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
    const CHECK_INTERVAL = 30000;
    const WARNING_TIME = 1200000;
    const TIMEOUT_TIME = 1800000;

    const interval = setInterval(() => {
      const inactiveTime = Date.now() - lastActivity;
      
      if (inactiveTime > TIMEOUT_TIME && joined) {
        leaveClass();
        alert("Session ended due to inactivity");
      } else if (inactiveTime > WARNING_TIME && !showTimeoutWarning && joined) {
        setShowTimeoutWarning(true);
      }
    }, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [lastActivity, showTimeoutWarning, joined]);

  // FIXED: Simple and reliable mute/unmute functions
  const muteStudentAudio = async (userId) => {
    try {
      await API.put(`/live/mute/${sessionId}/${userId}`, { mute: true });
      console.log(`Student ${userId} muted`);
    } catch (error) {
      console.error("Error muting student:", error);
    }
  };

  const unmuteStudentAudio = async (userId) => {
    try {
      await API.put(`/live/mute/${sessionId}/${userId}`, { mute: false });
      console.log(`Student ${userId} unmuted`);
    } catch (error) {
      console.error("Error unmuting student:", error);
    }
  };

  // FIXED: Simple toggle mute that actually works
  const toggleMute = async () => {
    if (!localTracksRef.current?.audioTrack) return;

    try {
      if (isMuted) {
        // Unmute
        if (isTeacher) {
          // Teachers can always unmute
          await localTracksRef.current.audioTrack.setEnabled(true);
          setIsMuted(false);
          console.log("Teacher unmuted");
        } else if (hasSpeakingPermission) {
          // Students with permission can unmute
          await localTracksRef.current.audioTrack.setEnabled(true);
          setIsMuted(false);
          console.log("Student unmuted with permission");
        } else {
          // Students without permission need to request
          await requestSpeakingPermission();
        }
      } else {
        // Mute
        await localTracksRef.current.audioTrack.setEnabled(false);
        setIsMuted(true);
        console.log("Muted");
      }
    } catch (err) {
      console.error("Toggle mute failed:", err);
    }
  };

  // Grant speaking permission
  const grantSpeakingPermission = async (studentId) => {
    try {
      await API.put(`/live/grant-speaking/${sessionId}/${studentId}`);
      setPendingRequests(prev => prev.filter(req => req.studentId !== studentId));
      
      // Refresh participants
      const sessionResponse = await API.get(`/live/session/${sessionId}`);
      if (sessionResponse.data.participants) {
        setParticipants(sessionResponse.data.participants);
      }
    } catch (err) {
      console.error("Grant permission failed:", err);
    }
  };

  // Mute all students
  const muteAllStudents = async () => {
    try {
      await API.put(`/live/mute-all/${sessionId}`);
      console.log("All students muted");
    } catch (err) {
      console.error("Mute all failed:", err);
    }
  };

  // Unmute all students
  const unmuteAllStudents = async () => {
    try {
      await API.put(`/live/unmute-all/${sessionId}`);
      console.log("All students unmuted");
    } catch (err) {
      console.error("Unmute all failed:", err);
    }
  };

  // Start Screen Sharing
  const startScreenShare = async () => {
    try {
      if (!isTeacher) {
        alert("Only teachers can share screen");
        return;
      }

      setIsScreenShareLoading(true);
      const screenTrack = await AgoraRTC.createScreenVideoTrack({
        encoderConfig: "1080p_1",
      }, "auto");

      if (localTracksRef.current?.videoTrack) {
        await client.unpublish(localTracksRef.current.videoTrack);
      }

      await client.publish(screenTrack);
      
      if (Array.isArray(screenTrack)) {
        screenTrack[0].play("local-player");
        setScreenShareTrack(screenTrack[0]);
      } else {
        screenTrack.play("local-player");
        setScreenShareTrack(screenTrack);
      }

      await API.post(`/live/screen-share/start/${sessionId}`);
      setIsScreenSharing(true);
      
    } catch (err) {
      console.error("Start screen share failed:", err);
      if (err.message?.includes('PERMISSION_DENIED') || err.name === 'NotAllowedError') {
        if (localTracksRef.current?.videoTrack) {
          await client.publish(localTracksRef.current.videoTrack);
          localTracksRef.current.videoTrack.play("local-player");
        }
      }
    } finally {
      setIsScreenShareLoading(false);
    }
  };

  // Stop Screen Sharing
  const stopScreenShare = async () => {
    try {
      setIsScreenShareLoading(true);

      if (screenShareTrack) {
        await client.unpublish(screenShareTrack);
        screenShareTrack.close();
        setScreenShareTrack(null);
      }

      if (localTracksRef.current?.videoTrack) {
        await client.publish(localTracksRef.current.videoTrack);
        localTracksRef.current.videoTrack.play("local-player");
      }

      await API.post(`/live/screen-share/stop/${sessionId}`);
      setIsScreenSharing(false);
      
    } catch (err) {
      console.error("Stop screen share failed:", err);
    } finally {
      setIsScreenShareLoading(false);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  };

  // Toggle Video
  const toggleVideo = async () => {
    if (!localTracksRef.current?.videoTrack) return;

    setIsVideoLoading(true);
    try {
      const newVideoState = !isVideoOn;
      await localTracksRef.current.videoTrack.setEnabled(newVideoState);
      setIsVideoOn(newVideoState);
    } catch (err) {
      console.error("Toggle video failed:", err);
    } finally {
      setIsVideoLoading(false);
    }
  };

  // Recording functions
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
      alert("Recording stopped successfully!");
      
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

  // User published event handler
  const handleUserPublished = async (user, mediaType) => {
    console.log("User published:", user.uid, mediaType);
    
    try {
      await client.subscribe(user, mediaType);
      
      setTimeout(() => {
        if (mediaType === "video" && user.videoTrack) {
          const playerElement = document.getElementById(`remote-${user.uid}`);
          if (playerElement) {
            user.videoTrack.play(`remote-${user.uid}`);
          }
        }
        
        if (mediaType === "audio" && user.audioTrack) {
          user.audioTrack.play();
        }
      }, 200);
      
      setRemoteUsers((prev) => {
        const existingUser = prev.find(u => u.uid === user.uid);
        if (existingUser) {
          return prev.map(u => u.uid === user.uid ? { ...u, ...user } : u);
        } else {
          return [...prev, user];
        }
      });
      
    } catch (error) {
      console.error("Error subscribing to user:", error);
    }
  };

  // FIXED: Simple and reliable joinClass function
  const joinClass = async () => {
    try {
      setIsJoinLoading(true);
      console.log("Joining class...");
      
      const token = localStorage.getItem("token");
      if (!token) {
        alert("Please log in again");
        navigate("/register");
        return;
      }

      // Request permissions first
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch (err) {
        alert("Microphone and camera access is required.");
        return;
      }

      const joinResponse = await API.post(`/live/join/${sessionId}`);
      const { session, token: agoraToken, participantInfo } = joinResponse.data;
      
      setSessionInfo(session);
      setParticipantInfo(participantInfo);
      
      // Set role and permissions
      const userRole = localStorage.getItem("role");
      const isUserTeacher = participantInfo.role === "host" || userRole === "teacher" || userRole === "admin";
      setIsTeacher(isUserTeacher);
      
      // Set initial audio state
      setIsMuted(participantInfo.isMuted);
      setHasSpeakingPermission(participantInfo.hasSpeakingPermission);

      // Join Agora channel
      await client.join(appId, session.channelName, agoraToken, null);

      // Create and publish tracks
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      
      localTracksRef.current = { audioTrack, videoTrack };
      setLocalTracks({ audioTrack, videoTrack });

      // Set initial audio state based on participant info
      if (participantInfo.isMuted) {
        await audioTrack.setEnabled(false);
      } else {
        await audioTrack.setEnabled(true);
      }

      // Publish both tracks
      await client.publish([audioTrack, videoTrack]);
      videoTrack.play("local-player");

      // Setup event handlers
      client.on("user-published", handleUserPublished);
      client.on("user-unpublished", (user, mediaType) => {
        if (mediaType === "video" && user.videoTrack) {
          user.videoTrack.stop();
        }
        if (mediaType === "audio" && user.audioTrack) {
          user.audioTrack.stop();
        }
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      });

      client.on("user-joined", (user) => {
        console.log("User joined:", user.uid);
      });

      client.on("user-left", (user) => {
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      });
      
      setJoined(true);
      startSessionPolling();

    } catch (err) {
      console.error("Join failed:", err);
      let errorMessage = "Failed to join class. Please try again.";
      
      if (err.response?.status === 401) {
        errorMessage = "Authentication failed. Please log in again.";
      } else if (err.response?.status === 404) {
        errorMessage = "Live session not found or has ended.";
      } else if (err.name === 'NotAllowedError') {
        errorMessage = "Microphone and camera access is required.";
      }
      
      alert(errorMessage);
    } finally {
      setIsJoinLoading(false);
    }
  };

  // Session polling
  const startSessionPolling = () => {
    const interval = setInterval(async () => {
      try {
        const response = await API.get(`/live/session/${sessionId}`);
        
        if (!response.data) return;

        const { participants, chatMessages, permissionRequests, isActive } = response.data;

        if (isActive === false) {
          clearInterval(interval);
          return;
        }
        
        if (participants) setParticipants(participants);
        if (chatMessages) setChatMessages(chatMessages);
        
        if (permissionRequests) {
          const pending = permissionRequests.filter(req => req.status === "pending");
          setPendingRequests(pending);
        }

        // Update current user's audio state
        const currentUserId = localStorage.getItem("userId");
        const currentParticipant = participants?.find(p => String(p.studentId) === currentUserId);
        if (currentParticipant) {
          if (currentParticipant.isMuted !== isMuted) {
            setIsMuted(currentParticipant.isMuted);
            if (localTracksRef.current?.audioTrack) {
              await localTracksRef.current.audioTrack.setEnabled(!currentParticipant.isMuted);
            }
          }
          
          if (currentParticipant.hasSpeakingPermission !== hasSpeakingPermission) {
            setHasSpeakingPermission(currentParticipant.hasSpeakingPermission);
          }
        }

      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  };

  // Raise/lower hand
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
    }
  };

  // Send chat message
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

  // End Live Class
  const endLiveClass = async () => {
    if (!window.confirm("Are you sure you want to end this live class for everyone?")) return;

    try {
      await API.put(`/live/end/${sessionId}`);
      alert("Live class ended successfully.");
      
      const userRole = localStorage.getItem("role");
      if (userRole === "teacher") navigate("/teacher");
      else if (userRole === "admin") navigate("/admin");
      else navigate("/student");
    } catch (err) {
      console.error("End live class failed:", err);
    }
  };

  // Leave class
  const leaveClass = async () => {
    try {
      if (isScreenSharing) await stopScreenShare();
      
      localTracksRef.current.audioTrack?.close();
      localTracksRef.current.videoTrack?.close();
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

  // Cleanup
  useEffect(() => {
    return () => {
      if (screenShareTrack) screenShareTrack.close();
      localTracksRef.current.audioTrack?.close();
      localTracksRef.current.videoTrack?.close();
      client.leave();
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
            >
              Continue Session
            </button>
          </div>
        </div>
      )}

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
        
        {isMobile && (
          <button
            onClick={() => setShowControls(!showControls)}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm"
          >
            {showControls ? "Hide Controls" : "Show Controls"}
          </button>
        )}
        
        <div className={`flex items-center space-x-2 sm:space-x-4 ${isMobile && !showControls ? 'hidden' : 'flex'}`}>
          {isRecording && (
            <div className="bg-red-600 text-white px-2 py-1 rounded-full text-xs sm:text-sm flex items-center">
              <span className="animate-pulse mr-1">🔴</span>
              <span className="hidden sm:inline">RECORDING</span>
            </div>
          )}

          {isTeacher && (
            <button
              onClick={toggleScreenShare}
              disabled={isScreenShareLoading}
              className={`p-2 sm:p-3 rounded-full ${
                isScreenSharing ? "bg-purple-600 hover:bg-purple-700" : "bg-gray-600 hover:bg-gray-700"
              } transition-all disabled:opacity-50`}
              title={isScreenSharing ? "Stop Screen Share" : "Start Screen Share"}
            >
              {isScreenShareLoading ? "⏳" : (isScreenSharing ? "🖥️●" : "🖥️")}
            </button>
          )}

          <button
            onClick={toggleVideo}
            disabled={isVideoLoading}
            className={`p-2 sm:p-3 rounded-full ${
              isVideoOn ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
            } transition-all disabled:opacity-50`}
            title={isVideoOn ? "Turn Off Video" : "Turn On Video"}
          >
            {isVideoLoading ? "⏳" : (isVideoOn ? "📹" : "📷")}
          </button>

          <button
            onClick={toggleMute}
            disabled={isMuteLoading}
            className={`p-2 sm:p-3 rounded-full ${
              isMuted ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
            } transition-all disabled:opacity-50`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuteLoading ? "⏳" : (isMuted ? "🔇" : "🎤")}
          </button>

          <button
            onClick={toggleHandRaise}
            disabled={isHandRaiseLoading}
            className={`p-2 sm:p-3 rounded-full ${
              isHandRaised ? "bg-yellow-600 hover:bg-yellow-700" : "bg-gray-600 hover:bg-gray-700"
            } transition-all disabled:opacity-50`}
            title={isHandRaised ? "Lower Hand" : "Raise Hand"}
          >
            {isHandRaiseLoading ? "⏳" : (isHandRaised ? "✋" : "🤚")}
          </button>

          {!isTeacher && (
            <div className={`px-2 py-1 rounded-full text-xs sm:text-sm ${
              hasSpeakingPermission ? "bg-green-600" : "bg-yellow-600"
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
          >
            <span className="hidden sm:inline">Leave Class</span>
            <span className="sm:hidden">Leave</span>
          </button>
        </div>
      </div>

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
        <div className={`${isMobile ? (showChat ? 'hidden' : 'flex-1') : 'flex-1'} p-2 sm:p-4`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
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

            {remoteUsers.map((user) => (
              <div key={user.uid} className="bg-black rounded-lg overflow-hidden relative aspect-video">
                <div 
                  id={`remote-${user.uid}`} 
                  className="w-full h-full remote-video-container"
                  style={{ background: '#000' }}
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

          {isTeacher && (
            <div className="mt-4 sm:mt-6 bg-gray-800 p-3 sm:p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-3">Teacher Controls</h3>
              
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
                      isRecording ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
                    } disabled:opacity-50`}
                  >
                    {isRecordingLoading ? "⏳" : (isRecording ? "⏹️ Stop" : "🔴 Start")}
                  </button>
                </div>
              </div>
              
              <div className="mb-4 p-3 bg-purple-600 bg-opacity-20 rounded">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className="font-semibold text-sm sm:text-base">Screen Sharing: {isScreenSharing ? "ACTIVE" : "INACTIVE"}</span>
                  <button
                    onClick={toggleScreenShare}
                    disabled={isScreenShareLoading}
                    className={`px-3 py-1 rounded text-sm ${
                      isScreenSharing ? "bg-red-600 hover:bg-red-700" : "bg-purple-600 hover:bg-purple-700"
                    } disabled:opacity-50`}
                  >
                    {isScreenShareLoading ? "⏳" : (isScreenSharing ? "Stop" : "Start")}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={muteAllStudents}
                  className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm flex-1 min-w-[120px]"
                >
                  Mute All
                </button>
                <button
                  onClick={unmuteAllStudents}
                  className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm flex-1 min-w-[120px]"
                >
                  Unmute All
                </button>
                <button
                  onClick={endLiveClass}
                  className="bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded text-sm flex-1 min-w-[120px]"
                >
                  🛑 End Class
                </button>
              </div>

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
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => revokeSpeakingPermission(request.studentId)}
                            className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs"
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                        {participant.isMuted ? (
                          <button 
                            onClick={() => unmuteStudentAudio(participant.studentId)} 
                            className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-xs transition-colors"
                          >
                            Unmute
                          </button>
                        ) : (
                          <button 
                            onClick={() => muteStudentAudio(participant.studentId)} 
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs transition-colors"
                          >
                            Mute
                          </button>
                        )}
                        {!participant.hasSpeakingPermission && (
                          <button
                            onClick={() => grantSpeakingPermission(participant.studentId)}
                            className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs"
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
          
          <div 
            ref={chatContainerRef}
            className="flex-1 p-4 overflow-y-auto space-y-3"
          >
            {hasMoreChat && (
              <div className="text-center mb-4">
                <button
                  onClick={loadMoreChat}
                  disabled={isLoadingChat}
                  className="bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded text-sm disabled:opacity-50"
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

          <div className="p-4 border-t border-gray-700">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 bg-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={sendMessage}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

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
            >
              {isJoinLoading ? "Joining..." : "Join Class Now"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}