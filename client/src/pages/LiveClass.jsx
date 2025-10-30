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
  const [isVideoOn, setIsVideoOn] = useState(true); // ADDED: Video state
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [hasSpeakingPermission, setHasSpeakingPermission] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [participants, setParticipants] = useState([]);
  const [isTeacher, setIsTeacher] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);

  const appId = import.meta.env.VITE_AGORA_APP_ID;
  const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  const chatContainerRef = useRef(null);

  // Toggle Video On/Off - ADDED
  const toggleVideo = async () => {
    try {
      if (!localTracks.video) return;

      const newVideoState = !isVideoOn;

      // Enable/disable camera locally
      localTracks.video.setEnabled(newVideoState);
      setIsVideoOn(newVideoState);

      // Update backend
      await API.put(`/live/video/${sessionId}`, { videoOn: newVideoState });

    } catch (err) {
      console.error("Toggle video failed:", err);
      alert(err.response?.data?.message || "Failed to toggle video");
    }
  };

  // End Live Class - ADDED (Teacher only)
  const endLiveClass = async () => {
    if (!window.confirm("Are you sure you want to end this live class for everyone?")) return;

    try {
      await API.put(`/live/end/${sessionId}`);
      alert("Live class ended successfully.");
      navigate("/dashboard"); // or wherever you want to redirect
    } catch (err) {
      console.error("End live class failed:", err);
      alert(err.response?.data?.message || "Failed to end class");
    }
  };

  // Fetch session info and join class
  const joinClass = async () => {
    try {
      // Join the live session via backend
      const joinResponse = await API.post(`/live/join/${sessionId}`);
      const { session, token, participantInfo } = joinResponse.data;
      
      setSessionInfo(session);
      setParticipantInfo(participantInfo);
      setIsMuted(participantInfo.isMuted);
      setHasSpeakingPermission(participantInfo.hasSpeakingPermission);
      setIsTeacher(session.isHost);

      // Join Agora channel
      const uid = await client.join(appId, session.channelName, token, null);

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
      console.error("Join failed:", err);
      alert("Failed to join class: " + (err.response?.data?.message || err.message));
    }
  };

  // Poll for session updates
  const startSessionPolling = () => {
    const interval = setInterval(async () => {
      if (!sessionId) return;
      try {
        const response = await API.get(`/live/session/${sessionId}`);
        const { participants, chatMessages, permissionRequests, isActive } = response.data; // UPDATED: Added isActive

        // UPDATED: Check if class has ended
        if (!isActive) {
          alert("Class has ended.");
          navigate("/dashboard");
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
        }

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

  useEffect(() => {
    return () => {
      localTracks.audio?.close();
      localTracks.video?.close();
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
          {/* Video Controls - ADDED */}
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
            {/* Local Video */}
            <div className="bg-black rounded-lg overflow-hidden relative">
              <div id="local-player" className="w-full h-48"></div>
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
                You {isMuted && "🔇"} {!isVideoOn && "📷"}
              </div>
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
                {/* End Live Class - ADDED */}
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