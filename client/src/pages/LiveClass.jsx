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

  // End Live Class (Teacher only)
  const endLiveClass = async () => {
    if (!window.confirm("Are you sure you want to end this live class for everyone?")) return;

    try {
      await API.put(`/live/end/${sessionId}`);
      alert("Live class ended successfully.");
      // Redirect teacher to their dashboard after ending class
      const userRole = localStorage.getItem("role");
      if (userRole === "teacher") {
        navigate("/teacher");
      } else if (userRole === "admin") {
        navigate("/admin");
      } else {
        navigate("/student");
      }
    } catch (err) {
      console.error("End live class failed:", err);
      alert(err.response?.data?.message || "Failed to end class");
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

  // UPDATED: Fetch session info and join class with simplified auth check
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

      // Create local tracks
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      
      // Apply initial mute state
      if (participantInfo.isMuted) {
        audioTrack.setEnabled(false);
      }

      setLocalTracks({ audio: audioTrack, video: videoTrack });
      videoTrack.play("local-player");

      // Setup remote user handling
      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video") {
          user.videoTrack.play(`remote-${user.uid}`);
        }
        if (mediaType === "audio") {
          user.audioTrack.play();
        }
        setRemoteUsers((prev) => [...prev, user]);
      });

      client.on("user-unpublished", (user) => {
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      });

      // Publish tracks
      await client.publish([audioTrack, videoTrack]);
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

  // Poll for session updates
  const startSessionPolling = () => {
    const interval = setInterval(async () => {
      if (!sessionId) return;
      try {
        const response = await API.get(`/live/session/${sessionId}`);
        const { participants, chatMessages, permissionRequests, isActive } = response.data;

        // Only check if class is active - don't auto-redirect
        if (!isActive) {
          console.log("Class has ended");
          return;
        }
        
        setParticipants(participants);
        setChatMessages(chatMessages);
        if (isTeacher) {
          setPendingRequests(permissionRequests.filter(req => req.status === "pending"));
        }

        // Update local state based on participant info
        const currentParticipant = participants.find(p => p.studentId === localStorage.getItem("userId"));
        if (currentParticipant) {
          setIsMuted(currentParticipant.isMuted);
          setHasSpeakingPermission(currentParticipant.hasSpeakingPermission);
          setIsHandRaised(currentParticipant.isHandRaised);
          // Update screen sharing state
          if (isTeacher) {
            setIsScreenSharing(currentParticipant.isScreenSharing || false);
          }
        }

        // Update recording status in polling
        await updateRecordingStatus();

      } catch (err) {
        console.error("Error polling session:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  };

  // Toggle mute/unmute
  const toggleMute = async () => {
    if (!localTracks.audio) return;

    try {
      if (isMuted) {
        // Try to unmute
        if (!hasSpeakingPermission) {
          await requestSpeakingPermission();
          return;
        }
        await API.put(`/live/self-unmute/${sessionId}`);
        localTracks.audio.setEnabled(true);
        setIsMuted(false);
      } else {
        await API.put(`/live/self-mute/${sessionId}`);
        localTracks.audio.setEnabled(false);
        setIsMuted(true);
      }
    } catch (err) {
      console.error("Toggle mute failed:", err);
      alert(err.response?.data?.message || "Failed to toggle audio");
    }
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

  // Teacher controls
  const grantSpeakingPermission = async (studentId) => {
    try {
      await API.put(`/live/grant-speaking/${sessionId}/${studentId}`);
      setPendingRequests(prev => prev.filter(req => req.studentId !== studentId));
    } catch (err) {
      console.error("Grant permission failed:", err);
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
      await API.put(`/live/mute/${sessionId}/${studentId}`, { mute: true });
    } catch (err) {
      console.error("Mute student failed:", err);
    }
  };

  const unmuteStudent = async (studentId) => {
    try {
      await API.put(`/live/mute/${sessionId}/${studentId}`, { mute: false });
    } catch (err) {
      console.error("Unmute student failed:", err);
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

            {/* Remote Videos */}
            {remoteUsers.map((user) => (
              <div key={user.uid} className="bg-black rounded-lg overflow-hidden relative">
                <div id={`remote-${user.uid}`} className="w-full h-48"></div>
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
                  User {user.uid}
                </div>
              </div>
            ))}
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
                        {participant.isHandRaised && <span className="text-yellow-400">✋</span>}
                        {participant.isMuted && <span className="text-red-400">🔇</span>}
                        {participant.hasSpeakingPermission && <span className="text-green-400">🎤</span>}
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
          </div>
          
          {/* Chat Messages */}
          <div 
            ref={chatContainerRef}
            className="flex-1 p-4 overflow-y-auto space-y-3"
          >
            {chatMessages.map((message, index) => (
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
            ))}
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