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

  const appId = import.meta.env.VITE_AGORA_APP_ID;
  const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  const chatContainerRef = useRef(null);

  // Debug useEffect to monitor chat state
  useEffect(() => {
    console.log("💬 Chat messages updated:", chatMessages);
    console.log("💬 Chat messages length:", chatMessages.length);
  }, [chatMessages]);

  // Add this function to handle audio track updates when permission is granted
  const forceAudioUpdate = async () => {
    try {
      if (localTracks.audio && hasSpeakingPermission) {
        console.log("🎯 Republishing audio track after permission grant");
        
        // Unpublish and republish audio track with new permissions
        await client.unpublish(localTracks.audio);
        
        // Re-enable the audio track
        localTracks.audio.setEnabled(true);
        
        // Republish the audio track
        await client.publish(localTracks.audio);
        
        console.log("✅ Audio track republished successfully after permission grant");
      }
    } catch (error) {
      console.error("❌ Error forcing audio update:", error);
    }
  };

  // Add this function to handle video track updates
  const forceVideoUpdate = async () => {
    try {
      if (localTracks.video && hasSpeakingPermission) {
        // Republish video track to ensure it's available to others
        await client.unpublish(localTracks.video);
        await client.publish(localTracks.video);
        console.log("✅ Video track republished after permission grant");
      }
    } catch (error) {
      console.error("❌ Error forcing video update:", error);
    }
  };

  // Debug audio state
  useEffect(() => {
    console.log("🎧 AUDIO STATE DEBUG:", {
      isMuted,
      hasSpeakingPermission,
      audioTrackExists: !!localTracks.audio,
      audioTrackEnabled: localTracks.audio?.enabled,
      audioTrackPublished: localTracks.audio?.isPublished
    });
  }, [isMuted, hasSpeakingPermission, localTracks.audio]);

  // FIXED: Enhanced toggle mute function
  const toggleMute = async () => {
    if (!localTracks.audio) {
      console.error("❌ No audio track available");
      return;
    }

    try {
      if (isMuted) {
        // If muted and trying to unmute
        if (!hasSpeakingPermission) {
          console.log("🔔 No speaking permission - requesting...");
          await requestSpeakingPermission();
          
          // Don't return here - wait for permission and then unmute
          // The polling will handle the actual unmute when permission is granted
          return;
        }
        
        // If we have permission, proceed with unmute
        console.log("🎤 Unmuting with permission...");
        await API.put(`/live/self-unmute/${sessionId}`);
        localTracks.audio.setEnabled(true);
        setIsMuted(false);
        console.log("✅ Successfully unmuted");
        
      } else {
        // Muting is always allowed
        console.log("🔇 Muting...");
        await API.put(`/live/self-mute/${sessionId}`);
        localTracks.audio.setEnabled(false);
        setIsMuted(true);
        console.log("✅ Successfully muted");
      }
    } catch (err) {
      console.error("❌ Toggle mute failed:", err);
      alert(err.response?.data?.message || "Failed to toggle audio");
    }
  };

  // Add this function to handle immediate permission updates
  const handleImmediatePermissionUpdate = async (studentId, hasPermission) => {
    try {
      // Force update the participants list
      const sessionResponse = await API.get(`/live/session/${sessionId}`);
      if (sessionResponse.data.participants) {
        setParticipants(sessionResponse.data.participants);
      }
      
      // If it's the current user, force audio update
      if (studentId === localStorage.getItem("userId") && hasPermission && localTracks.audio) {
        console.log("🎯 Immediate audio update for permission grant");
        localTracks.audio.setEnabled(true);
        setIsMuted(false);
        
        // Republish audio track
        setTimeout(async () => {
          try {
            await client.unpublish(localTracks.audio);
            await client.publish(localTracks.audio);
            console.log("✅ Audio track immediately republished");
          } catch (error) {
            console.error("❌ Immediate audio republish failed:", error);
          }
        }, 100);
      }
    } catch (error) {
      console.error("❌ Immediate permission update failed:", error);
    }
  };

  // Start Screen Sharing
  const startScreenShare = async () => {
    try {
      if (!isTeacher) {
        alert("Only teachers can share screen");
        return;
      }

      // Create screen share track
      const screenTrack = await AgoraRTC.createScreenVideoTrack({
        encoderConfig: "1080p_1",
      }, "auto");

      // Unpublish camera video first
      if (localTracks.video) {
        await client.unpublish(localTracks.video);
      }

      // Publish screen share track
      await client.publish(screenTrack);
      
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
      
      console.log("Screen sharing started successfully");

    } catch (err) {
      console.error("Start screen share failed:", err);
      
      // If user cancels screen share picker, republish camera
      if (err.message?.includes('PERMISSION_DENIED') || err.name === 'NotAllowedError') {
        if (localTracks.video) {
          await client.publish(localTracks.video);
          localTracks.video.play("local-player");
        }
      } else {
        alert("Failed to start screen sharing: " + (err.message || "Unknown error"));
      }
    }
  };

  // Stop Screen Sharing
  const stopScreenShare = async () => {
    try {
      if (screenShareTrack) {
        // Unpublish screen share track
        await client.unpublish(screenShareTrack);
        screenShareTrack.close();
        setScreenShareTrack(null);
      }

      // Republish camera video
      if (localTracks.video) {
        await client.publish(localTracks.video);
        localTracks.video.play("local-player");
      }

      // Update backend
      await API.post(`/live/screen-share/stop/${sessionId}`);
      setIsScreenSharing(false);
      
      console.log("Screen sharing stopped");

    } catch (err) {
      console.error("Stop screen share failed:", err);
      alert("Failed to stop screen sharing");
    }
  };

  // Toggle Screen Sharing
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  };

  // Toggle Video On/Off
  const toggleVideo = async () => {
    try {
      if (!localTracks.video) return;

      const newVideoState = !isVideoOn;

      // Just toggle camera locally
      await localTracks.video.setEnabled(newVideoState);
      setIsVideoOn(newVideoState);
    } catch (err) {
      console.error("Toggle video failed:", err);
    }
  };

  // Recording functions
  const startRecording = async () => {
    try {
      if (!isTeacher) {
        alert("Only teachers can start recording");
        return;
      }

      const response = await API.post(`/live/recording/start/${sessionId}`);
      setIsRecording(true);
      setRecordingStatus(response.data.recording);
      alert("Recording started successfully!");
      
    } catch (err) {
      console.error("Start recording failed:", err);
      alert(err.response?.data?.message || "Failed to start recording");
    }
  };

  const stopRecording = async () => {
    try {
      if (!isTeacher) {
        alert("Only teachers can stop recording");
        return;
      }

      const response = await API.post(`/live/recording/stop/${sessionId}`);
      setIsRecording(false);
      setRecordingStatus(response.data.recording);
      alert("Recording stopped successfully! The recording will be available for playback.");
      
    } catch (err) {
      console.error("Stop recording failed:", err);
      alert(err.response?.data?.message || "Failed to stop recording");
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

  // UPDATED: Fetch session info and join class with proper microphone permission
  const joinClass = async () => {
    try {
      console.log("🔄 Attempting to join class...");
      console.log("📋 Session ID:", sessionId);
      console.log("👤 User Role:", localStorage.getItem("role"));
      console.log("🔑 User ID:", localStorage.getItem("userId"));
      
      // ✅ SIMPLIFIED AUTH CHECK - Only check token
      const token = localStorage.getItem("token");
      
      if (!token) {
        console.error("❌ No authentication token found");
        alert("Please log in again");
        navigate("/register");
        return;
      }

      console.log("✅ Authentication token present");

      // ✅ CRITICAL FIX: Request microphone permission BEFORE joining
      try {
        console.log("🎤 Requesting microphone permission...");
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: true 
        });
        console.log("✅ Microphone and camera access granted");
        // Stop the tracks immediately since we'll create proper ones with Agora
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.error("❌ Microphone/camera permission denied:", err);
        alert("Microphone and camera access is required to join the live class. Please allow permissions and try again.");
        return;
      }

      // Join the live session via backend
      const joinResponse = await API.post(`/live/join/${sessionId}`);
      console.log("✅ Join response:", joinResponse.data);
      
      const { session, token: agoraToken, participantInfo } = joinResponse.data;
      
      setSessionInfo(session);
      setParticipantInfo(participantInfo);
      setIsMuted(participantInfo.isMuted);
      setHasSpeakingPermission(participantInfo.hasSpeakingPermission);
      
      // ✅ IMPROVED ROLE DETECTION
      const userRole = localStorage.getItem("role");
      const isUserTeacher = participantInfo.role === "host" || userRole === "teacher" || userRole === "admin";
      setIsTeacher(isUserTeacher);
      
      console.log("🎯 User is teacher/host:", isUserTeacher);
      console.log("🎯 Participant role:", participantInfo.role);
      console.log("🎯 User role from localStorage:", userRole);

      // Check if teacher is rejoining
      if (isUserTeacher && participantInfo.role === "host") {
        console.log("Teacher/Admin rejoining live session");
      }

      // Join Agora channel
      const uid = await client.join(appId, session.channelName, agoraToken, null);

      // Create local tracks with proper error handling
      console.log("🎤 Creating microphone and camera tracks...");
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks({}, {});
      
      console.log("✅ Tracks created:", {
        audioEnabled: audioTrack.enabled,
        videoEnabled: videoTrack.enabled,
        audioPublished: audioTrack.isPublished,
        videoPublished: videoTrack.isPublished
      });

      // Apply initial mute state
      if (participantInfo.isMuted) {
        audioTrack.setEnabled(false);
        console.log("🔇 Audio track initially muted");
      } else {
        audioTrack.setEnabled(true);
        console.log("🔊 Audio track initially enabled");
      }

      setLocalTracks({ audio: audioTrack, video: videoTrack });
      videoTrack.play("local-player");

      // Setup remote user handling
      client.on("user-published", async (user, mediaType) => {
        console.log("🔍 User published:", user.uid, "Media type:", mediaType);
        
        try {
          await client.subscribe(user, mediaType);
          console.log("✅ Subscribed to user:", user.uid, "for", mediaType);
          
          if (mediaType === "video") {
            setTimeout(() => {
              const playerElement = document.getElementById(`remote-${user.uid}`);
              if (playerElement && user.videoTrack) {
                console.log("🎥 Playing video for user:", user.uid);
                user.videoTrack.play(`remote-${user.uid}`);
              }
            }, 100);
          }
          
          if (mediaType === "audio") {
            if (user.audioTrack) {
              user.audioTrack.play();
              console.log("🔊 Playing audio for user:", user.uid);
            }
          }
          
          setRemoteUsers((prev) => {
            const existingUser = prev.find(u => u.uid === user.uid);
            if (existingUser) {
              return prev.map(u => u.uid === user.uid ? user : u);
            } else {
              return [...prev, user];
            }
          });
          
        } catch (error) {
          console.error("❌ Error subscribing to user:", error);
        }
      });

      client.on("user-unpublished", (user, mediaType) => {
        console.log("🔍 User unpublished:", user.uid, "Media type:", mediaType);
        
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
        console.log("🎉 User joined:", user.uid);
      });

      client.on("user-left", (user) => {
        console.log("👋 User left:", user.uid);
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      });

      // Publish tracks
      console.log("📡 Publishing audio and video tracks...");
      await client.publish([audioTrack, videoTrack]);
      console.log("✅ Tracks published successfully");
      
      setJoined(true);

      // Start polling for session updates
      startSessionPolling();

    } catch (err) {
      console.error("❌ Join failed:", err);
      console.error("❌ Error response:", err.response?.data);
      console.error("❌ Error status:", err.response?.status);
      
      if (err.response?.status === 401) {
        alert("Authentication failed. Please log in again.");
        navigate("/register");
      } else if (err.response?.status === 404) {
        alert("Live session not found or has ended.");
      } else {
        alert("Failed to join class: " + (err.response?.data?.message || err.message));
      }
    }
  };

  // ✅ FIXED: Poll for session updates with proper error handling
  const startSessionPolling = () => {
    console.log("🔄 Starting enhanced session polling...");
    
    const interval = setInterval(async () => {
      if (!sessionId) {
        console.log("❌ No sessionId available for polling");
        return;
      }
      
      try {
        console.log("📡 Polling session data for:", sessionId);
        const response = await API.get(`/live/session/${sessionId}`);
        
        if (!response.data) {
          console.log("❌ No data in polling response");
          return;
        }

        const { 
          participants, 
          chatMessages, 
          permissionRequests, 
          isActive, 
          userPermissions 
        } = response.data;

        console.log("🔍 POLLING DEBUG:");
        console.log("- Session isActive:", isActive);
        console.log("- Chat messages received:", chatMessages?.length || 0);
        console.log("- User permissions:", userPermissions);
        
        // CRITICAL FIX: Update teacher status from backend
        if (userPermissions) {
          console.log("🎯 Updating teacher status from backend:", userPermissions.isTeacher);
          setIsTeacher(userPermissions.isTeacher);
        }

        // Only stop if session is truly ended
        if (isActive === false) {
          console.log("⏹️ Session has ended - stopping updates");
          // Don't return here, we still want to update UI with final state
        }
        
        // Update participants
        if (participants && Array.isArray(participants)) {
          setParticipants(participants);
        }
        
        // CRITICAL FIX: Update chat messages with proper validation
        if (chatMessages && Array.isArray(chatMessages)) {
          console.log("💬 Setting chat messages:", chatMessages.length);
          setChatMessages(chatMessages);
          
          // Debug first message
          if (chatMessages.length > 0) {
            console.log("💬 First message sample:", {
              userName: chatMessages[0].userName,
              message: chatMessages[0].message,
              type: chatMessages[0].messageType
            });
          }
        } else {
          console.log("⚠️ No valid chat messages in response");
          setChatMessages([]);
        }
        
        // Update pending requests for teachers
        if (userPermissions?.isTeacher && permissionRequests) {
          const pending = permissionRequests.filter(req => req.status === "pending");
          setPendingRequests(pending);
          console.log("📋 Pending requests:", pending.length);
        }

        // FIXED: Enhanced permission handling in polling
        const currentUserId = localStorage.getItem("userId");
        if (participants && currentUserId) {
          const currentParticipant = participants.find(p => p.studentId === currentUserId);
          if (currentParticipant) {
            console.log("👤 Updating participant state:", {
              isMuted: currentParticipant.isMuted,
              hasPermission: currentParticipant.hasSpeakingPermission,
              handRaised: currentParticipant.isHandRaised
            });
            
            // Update mute state
            if (currentParticipant.isMuted !== isMuted) {
              setIsMuted(currentParticipant.isMuted);
              if (localTracks.audio) {
                localTracks.audio.setEnabled(!currentParticipant.isMuted);
                console.log(`🔊 Audio track ${currentParticipant.isMuted ? 'muted' : 'unmuted'}`);
              }
            }
            
            // FIXED: Enhanced permission handling with immediate audio updates
            if (currentParticipant.hasSpeakingPermission !== hasSpeakingPermission) {
              const oldPermission = hasSpeakingPermission;
              setHasSpeakingPermission(currentParticipant.hasSpeakingPermission);
              console.log(`🎤 Speaking permission ${currentParticipant.hasSpeakingPermission ? 'granted' : 'revoked'}`);
              
              // CRITICAL: When permission is granted, ensure audio is properly enabled
              if (currentParticipant.hasSpeakingPermission && localTracks.audio) {
                console.log("🎯 Permission granted - enabling audio track immediately");
                
                // Force enable the audio track
                localTracks.audio.setEnabled(true);
                
                // CRITICAL: Republish audio track to ensure it's active for all users
                try {
                  await client.unpublish(localTracks.audio);
                  await client.publish(localTracks.audio);
                  console.log("✅ Audio track republished after permission grant");
                  
                  // Also update mute state if needed
                  if (isMuted) {
                    setIsMuted(false);
                  }
                } catch (error) {
                  console.error("❌ Error republishing audio:", error);
                }
              }
              
              // If permission was revoked, mute the audio
              if (!currentParticipant.hasSpeakingPermission && localTracks.audio && oldPermission) {
                console.log("🔇 Permission revoked - muting audio");
                localTracks.audio.setEnabled(false);
                setIsMuted(true);
              }
            }
            
            setIsHandRaised(currentParticipant.isHandRaised);
            
            // Update screen sharing state for teacher
            if (userPermissions?.isTeacher) {
              setIsScreenSharing(currentParticipant.isScreenSharing || false);
            }
          }
        }

        // Update recording status
        await updateRecordingStatus();

      } catch (err) {
        console.error("❌ Polling error:", err);
        console.error("Error details:", err.response?.data);
      }
    }, 3000);

    return () => {
      console.log("🛑 Clearing polling interval");
      clearInterval(interval);
    };
  };

  // Raise/lower hand
  const toggleHandRaise = async () => {
    try {
      const action = isHandRaised ? "lower" : "raise";
      await API.put(`/live/hand/${sessionId}`, { action });
      setIsHandRaised(!isHandRaised);
    } catch (err) {
      console.error("Toggle hand raise failed:", err);
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

  // Send chat message
  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      await API.post(`/live/chat/${sessionId}`, { message: newMessage });
      setNewMessage("");
    } catch (err) {
      console.error("Send message failed:", err);
    }
  };

  // FIXED: Teacher controls with enhanced permission checking
  const grantSpeakingPermission = async (studentId) => {
    try {
      console.log("🎯 Granting permission to:", studentId);
      
      const response = await API.put(`/live/grant-speaking/${sessionId}/${studentId}`);
      console.log("✅ Permission granted response:", response.data);
      
      // Update UI immediately
      setPendingRequests(prev => prev.filter(req => req.studentId !== studentId));
      
      // Force immediate update
      await handleImmediatePermissionUpdate(studentId, true);
      
    } catch (err) {
      console.error("❌ Grant permission failed:", err);
      alert(err.response?.data?.message || "Failed to grant permission");
    }
  };

  const revokeSpeakingPermission = async (studentId) => {
    try {
      await API.put(`/live/revoke-speaking/${sessionId}/${studentId}`);
    } catch (err) {
      console.error("Revoke permission failed:", err);
    }
  };

  const muteStudent = async (studentId) => {
    try {
      console.log("🔇 Muting student:", studentId);
      console.log("🔇 Current user is teacher:", isTeacher);
      
      const response = await API.put(`/live/mute/${sessionId}/${studentId}`, { mute: true });
      console.log("✅ Student muted:", response.data);
    } catch (err) {
      console.error("❌ Mute student failed:", err);
      console.error("Error response:", err.response?.data);
      alert(err.response?.data?.message || "Failed to mute student");
    }
  };

  // FIXED: Enhanced unmute student function
  const unmuteStudent = async (studentId) => {
    try {
      console.log("🔊 Unmuting student:", studentId);
      console.log("👨‍🏫 Current user is teacher:", isTeacher);
      
      const response = await API.put(`/live/mute/${sessionId}/${studentId}`, { 
        mute: false 
      });
      
      console.log("✅ Student unmuted via API:", response.data);
      
      // Force immediate UI update by refreshing participant data
      const sessionResponse = await API.get(`/live/session/${sessionId}`);
      if (sessionResponse.data.participants) {
        setParticipants(sessionResponse.data.participants);
      }
      
    } catch (err) {
      console.error("❌ Unmute student failed:", err);
      console.error("Error details:", err.response?.data);
      alert(err.response?.data?.message || "Failed to unmute student");
    }
  };

  const muteAllStudents = async () => {
    try {
      await API.put(`/live/mute-all/${sessionId}`);
    } catch (err) {
      console.error("Mute all failed:", err);
    }
  };

  const unmuteAllStudents = async () => {
    try {
      await API.put(`/live/unmute-all/${sessionId}`);
    } catch (err) {
      console.error("Unmute all failed:", err);
    }
  };

  // End Live Class (Teacher only) - Enhanced with better error handling
  const endLiveClass = async () => {
    if (!window.confirm("Are you sure you want to end this live class for everyone?")) return;

    try {
      console.log("🛑 Attempting to end class...");
      console.log("🛑 Current user is teacher:", isTeacher);
      console.log("🛑 Session ID:", sessionId);
      
      const response = await API.put(`/live/end/${sessionId}`);
      console.log("✅ Class ended successfully:", response.data);
      
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
      console.error("Error response:", err.response?.data);
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
      {/* Header */}
      <div className="bg-gray-800 p-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">
            🎥 {sessionInfo?.title || "Live Class"}
          </h1>
          <p className="text-gray-400">
            Teacher: {sessionInfo?.teacherName} | 
            Class: {sessionInfo?.className}
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Recording Indicator for all participants */}
          {isRecording && (
            <div className="bg-red-600 text-white px-3 py-1 rounded-full text-sm flex items-center">
              <span className="animate-pulse mr-2">🔴</span>
              RECORDING
            </div>
          )}

          {/* Screen Share Button for Teachers */}
          {isTeacher && (
            <button
              onClick={toggleScreenShare}
              className={`p-3 rounded-full ${
                isScreenSharing 
                  ? "bg-purple-600 hover:bg-purple-700" 
                  : "bg-gray-600 hover:bg-gray-700"
              } transition-all`}
              title={isScreenSharing ? "Stop Screen Share" : "Start Screen Share"}
            >
              {isScreenSharing ? "🖥️●" : "🖥️"}
            </button>
          )}

          {/* Video Controls */}
          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full ${
              isVideoOn 
                ? "bg-green-600 hover:bg-green-700" 
                : "bg-red-600 hover:bg-red-700"
            } transition-all`}
            title={isVideoOn ? "Turn Off Video" : "Turn On Video"}
          >
            {isVideoOn ? "📹" : "📷"}
          </button>

          {/* Audio Controls */}
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full ${
              isMuted 
                ? "bg-red-600 hover:bg-red-700" 
                : "bg-green-600 hover:bg-green-700"
            } transition-all`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? "🔇" : "🎤"}
          </button>

          {/* Hand Raise */}
          <button
            onClick={toggleHandRaise}
            className={`p-3 rounded-full ${
              isHandRaised 
                ? "bg-yellow-600 hover:bg-yellow-700" 
                : "bg-gray-600 hover:bg-gray-700"
            } transition-all`}
            title={isHandRaised ? "Lower Hand" : "Raise Hand"}
          >
            {isHandRaised ? "✋" : "🤚"}
          </button>

          {/* Permission Status */}
          {!isTeacher && (
            <div className={`px-3 py-1 rounded-full text-sm ${
              hasSpeakingPermission 
                ? "bg-green-600" 
                : "bg-yellow-600"
            }`}>
              {hasSpeakingPermission ? "🎤 Can Speak" : "⏳ Request Permission"}
            </div>
          )}

          <button
            onClick={leaveClass}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded transition-all"
          >
            Leave Class
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Video Grid - Left Side */}
        <div className="flex-1 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Local Video with Screen Sharing Indicator */}
            <div className="bg-black rounded-lg overflow-hidden relative">
              <div id="local-player" className="w-full h-48"></div>
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
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
              <div key={user.uid} className="bg-black rounded-lg overflow-hidden relative">
                <div 
                  id={`remote-${user.uid}`} 
                  className="w-full h-48 remote-video-container"
                  style={{ 
                    background: '#000',
                    minHeight: '192px'
                  }}
                >
                  {/* Add a loading indicator */}
                  <div className="absolute inset-0 flex items-center justify-center text-white">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                      <span className="text-sm">Loading video...</span>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
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
              <div>Audio Track Enabled: {localTracks.audio?.enabled ? "✅ YES" : "❌ NO"}</div>
              <div>Audio Track Published: {localTracks.audio?.isPublished ? "✅ YES" : "❌ NO"}</div>
            </div>
          </div>

          {/* Teacher Controls */}
          {isTeacher && (
            <div className="mt-6 bg-gray-800 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-3">Teacher Controls</h3>
              
              {/* Recording Controls */}
              <div className="mb-4 p-3 bg-red-600 bg-opacity-20 rounded">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold">Recording: {isRecording ? "🔴 RECORDING" : "⏸️ NOT RECORDING"}</span>
                    {isRecording && recordingStatus?.startTime && (
                      <div className="text-xs text-gray-300">
                        Started: {new Date(recordingStatus.startTime).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={toggleRecording}
                    className={`px-3 py-1 rounded text-sm ${
                      isRecording 
                        ? "bg-red-600 hover:bg-red-700" 
                        : "bg-green-600 hover:bg-green-700"
                    }`}
                  >
                    {isRecording ? "⏹️ Stop Recording" : "🔴 Start Recording"}
                  </button>
                </div>
              </div>
              
              {/* Screen Sharing Status */}
              <div className="mb-4 p-3 bg-purple-600 bg-opacity-20 rounded">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Screen Sharing: {isScreenSharing ? "ACTIVE" : "INACTIVE"}</span>
                  <button
                    onClick={toggleScreenShare}
                    className={`px-3 py-1 rounded text-sm ${
                      isScreenSharing 
                        ? "bg-red-600 hover:bg-red-700" 
                        : "bg-purple-600 hover:bg-purple-700"
                    }`}
                  >
                    {isScreenSharing ? "Stop Sharing" : "Start Sharing"}
                  </button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex space-x-2 mb-4">
                <button
                  onClick={muteAllStudents}
                  className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm"
                >
                  Mute All
                </button>
                <button
                  onClick={unmuteAllStudents}
                  className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm"
                >
                  Unmute All
                </button>
                {/* End Live Class */}
                <button
                  onClick={endLiveClass}
                  className="bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded text-sm"
                >
                  🛑 End Live Class
                </button>
              </div>

              {/* Pending Permission Requests */}
              {pendingRequests.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-semibold mb-2">Pending Permission Requests</h4>
                  {pendingRequests.map((request) => (
                    <div key={request.requestId} className="flex items-center justify-between bg-yellow-600 bg-opacity-20 p-2 rounded mb-2">
                      <span>{request.studentName}</span>
                      <div className="flex space-x-2">
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
              )}

              {/* Participants List */}
              <div>
                <h4 className="font-semibold mb-2">Participants ({participants.length})</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {participants.map((participant) => (
                    <div key={participant.studentId} className="flex items-center justify-between bg-gray-700 p-2 rounded">
                      <div className="flex items-center space-x-2">
                        <span>{participant.name}</span>
                        {participant.isHandRaised && <span className="text-yellow-400 animate-pulse">✋</span>}
                        {participant.isMuted && <span className="text-red-400">🔇</span>}
                        {participant.hasSpeakingPermission && (
                          <span className="text-green-400" title="Can speak">🎤</span>
                        )}
                        {!participant.hasSpeakingPermission && participant.permissionRequested && (
                          <span className="text-orange-400 animate-pulse" title="Permission requested">⏳</span>
                        )}
                      </div>
                      <div className="flex space-x-1">
                        <button
                          onClick={() => muteStudent(participant.studentId)}
                          className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs"
                          disabled={participant.isMuted}
                        >
                          Mute
                        </button>
                        <button
                          onClick={() => unmuteStudent(participant.studentId)}
                          className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs"
                          disabled={!participant.isMuted}
                        >
                          Unmute
                        </button>
                        {!participant.hasSpeakingPermission && (
                          <button
                            onClick={() => grantSpeakingPermission(participant.studentId)}
                            className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs"
                          >
                            Grant Mic
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
        <div className="w-80 bg-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <h3 className="font-semibold">Chat</h3>
            <div className="text-xs text-gray-400 mt-1">
              {chatMessages.length} messages
            </div>
          </div>
          
          {/* Chat Messages */}
          <div 
            ref={chatContainerRef}
            className="flex-1 p-4 overflow-y-auto space-y-3"
          >
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
                  <p className="text-sm mt-1">{message.message}</p>
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

      {/* Join Button for non-joined state */}
      {!joined && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-lg text-center">
            <h2 className="text-2xl font-bold mb-4">Join Live Class</h2>
            <p className="text-gray-400 mb-6">
              {sessionInfo?.title || "Loading session..."}
            </p>
            <button
              onClick={joinClass}
              className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg text-lg font-semibold transition-all"
            >
              Join Class Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}