import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AgoraRTC from "agora-rtc-sdk-ng";
import API from "../api/axios";
import io from "socket.io-client";

// Create ONE client for the lifetime of the app, not per render
const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });

export default function LiveClass() {
  const navigate = useNavigate();
  const { sessionId } = useParams();

  const [joined, setJoined] = useState(false);
  const [localTracks, setLocalTracks] = useState({ audio: null, video: null });
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [participantInfo, setParticipantInfo] = useState(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [participants, setParticipants] = useState([]);
  const [isTeacher, setIsTeacher] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [socket, setSocket] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareTrack, setScreenShareTrack] = useState(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState(null);

  const [chatPage, setChatPage] = useState(1);
  const [hasMoreChat, setHasMoreChat] = useState(true);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  const [lastActivity, setLastActivity] = useState(Date.now());
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showControls, setShowControls] = useState(false);

  const [isMuteLoading, setIsMuteLoading] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [isHandRaiseLoading, setIsHandRaiseLoading] = useState(false);
  const [isScreenShareLoading, setIsScreenShareLoading] = useState(false);
  const [isRecordingLoading, setIsRecordingLoading] = useState(false);
  const [isJoinLoading, setIsJoinLoading] = useState(false);

  const [showEndModal, setShowEndModal] = useState(false);

  const appId = import.meta.env.VITE_AGORA_APP_ID;
  const chatContainerRef = useRef(null);
  const localTracksRef = useRef({ audio: null, video: null });
  // Keep a ref to socket so async callbacks always have the latest instance
  const socketRef = useRef(null);

  const isDevelopment = import.meta.env.DEV;
  const debugLog = (...args) => { if (isDevelopment) console.log(...args); };

  // ── Track management ────────────────────────────────────────────────────────
  const trackManagement = {
    publishTrack: async (track) => {
      try { await client.publish([track]); return true; }
      catch (e) { console.error("❌ publish failed:", e); return false; }
    },
    unpublishTrack: async (track) => {
      try { await client.unpublish([track]); return true; }
      catch { try { await client.unpublish(track); return true; } catch { return false; } }
    },
    enableTrack: (track, enabled) => {
      if (track) try { track.setEnabled(enabled); } catch (e) { console.error("enableTrack failed:", e); }
    },
  };

  // ── Socket setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    const newSocket = io("https://virtual-classroom-app-8wbh.onrender.com", {
      transports: ["websocket"],
      withCredentials: true,
    });

    newSocket.on("connect", () => {
      debugLog("✅ Socket connected:", newSocket.id);
      setIsSocketConnected(true);

      // FIX: If we're already in a session when socket reconnects, rejoin the room
      if (sessionId && localStorage.getItem("userId")) {
        newSocket.emit("join-session", {
          sessionId,
          userId: localStorage.getItem("userId"),
          userRole: localStorage.getItem("role"),
        });
        debugLog("✅ Rejoined socket room after reconnect");
      }
    });

    newSocket.on("disconnect", () => {
      debugLog("❌ Socket disconnected");
      setIsSocketConnected(false);
    });

    newSocket.on("connect_error", () => setIsSocketConnected(false));

    setSocket(newSocket);
    socketRef.current = newSocket;

    return () => { newSocket.disconnect(); };
  }, []);

  // ── Socket event listeners ──────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Real-time chat
    socket.on("new-chat-message", (message) => {
      setChatMessages((prev) => {
        // Deduplicate: don't add if same timestamp + user already exists
        const isDupe = prev.some(
          (m) => m.timestamp === message.timestamp && m.userName === message.userName && m.message === message.message
        );
        return isDupe ? prev : [...prev, message];
      });
    });

    // Participant updates (mute, hand raise, role changes)
    socket.on("participant-updated", (data) => {
      setParticipants((prev) =>
        prev.map((p) =>
          String(p.studentId) === String(data.studentId) ? { ...p, ...data } : p
        )
      );
    });

    // FIX: Hand raised — use studentId string comparison
    socket.on("hand-raised", (data) => {
      debugLog("✋ Hand raised event:", data);
      setParticipants((prev) =>
        prev.map((p) =>
          String(p.studentId) === String(data.studentId)
            ? { ...p, isHandRaised: true }
            : p
        )
      );
    });

    // Session ended by teacher
    socket.on("session-ended", () => {
      alert("Lesson has ended by the teacher. You will be redirected.");
      leaveClassWithRedirect();
    });

    // Student promoted to speaker
    socket.on("student-promoted", async ({ studentId, speakerToken, channelName }) => {
      const myId = localStorage.getItem("userId");
      if (String(studentId) !== String(myId)) return;

      debugLog("🎤 Promoted to speaker");
      try {
        await client.setClientRole("host");

        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localTracksRef.current.audio = audioTrack;
        setLocalTracks((prev) => ({ ...prev, audio: audioTrack }));

        await trackManagement.publishTrack(audioTrack);
        setIsMuted(false);
        setIsSpeaking(true);
      } catch (err) {
        console.error("Failed to switch to speaker:", err);
      }
    });

    // Student demoted back to audience
    socket.on("student-demoted", async ({ studentId }) => {
      const myId = localStorage.getItem("userId");
      if (String(studentId) !== String(myId)) return;

      debugLog("👥 Demoted back to audience");
      try {
        const audio = localTracksRef.current.audio;
        if (audio) {
          await trackManagement.unpublishTrack(audio);
          audio.close();
          localTracksRef.current.audio = null;
          setLocalTracks((prev) => ({ ...prev, audio: null }));
        }
        await client.setClientRole("audience", { level: 1 });
        setIsMuted(true);
        setIsSpeaking(false);
      } catch (err) {
        console.error("Failed to switch back to audience:", err);
      }
    });

    return () => {
      socket.off("new-chat-message");
      socket.off("participant-updated");
      socket.off("hand-raised");
      socket.off("session-ended");
      socket.off("student-promoted");
      socket.off("student-demoted");
    };
  }, [socket]);

  // ── Join class ──────────────────────────────────────────────────────────────
  const joinClass = async () => {
    try {
      setIsJoinLoading(true);

      const token = localStorage.getItem("token");
      const userRole = localStorage.getItem("role");

      if (userRole === "admin" && !localStorage.getItem("userId")) {
        localStorage.setItem("userId", "69025078d9063907000b4d59");
      }

      if (!token) { navigate("/register"); return; }

      // Teachers need cam+mic; students join as silent audience
      if (userRole !== "admin" && userRole !== "student") {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          alert("Microphone and camera access is required to teach the class.");
          return;
        }
      }

      const joinResponse = await API.post(`/live/join/${sessionId}`);
      const { session, token: agoraToken, participantInfo } = joinResponse.data;

      setSessionInfo(session);
      setParticipantInfo(participantInfo);

      const isHost = session.isHost;
      setIsTeacher(isHost);
      setIsMuted(!isHost);
      setIsVideoOn(isHost);

      // FIX: Join socket room BEFORE Agora join so events don't get missed
      const currentSocket = socketRef.current;
      if (currentSocket && currentSocket.connected) {
        currentSocket.emit("join-session", {
          sessionId,
          userId: localStorage.getItem("userId"),
          userRole: localStorage.getItem("role"),
        });
        debugLog("✅ Joined socket room before Agora join");
      }

      // Set Agora client role BEFORE joining channel
      if (isHost) {
        await client.setClientRole("host");
      } else {
        await client.setClientRole("audience", { level: 1 });
      }

      await client.join(appId, session.channelName, agoraToken, null);

      if (isHost) {
        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
          { AEC: true, ANS: true, AGC: true, encoderConfig: { sampleRate: 48000, stereo: false, bitrate: 64 } },
          {}
        );

        localTracksRef.current = { audio: audioTrack, video: videoTrack };
        setLocalTracks({ audio: audioTrack, video: videoTrack });
        videoTrack.play("local-player");
        await client.publish([audioTrack, videoTrack]);
        debugLog("✅ Host tracks published");
      } else {
        localTracksRef.current = { audio: null, video: null };
        debugLog("✅ Joined as audience — zero track cost");
      }

      // Remote user handlers
      client.on("user-published", handleUserPublished);
      client.on("user-unpublished", (user, mediaType) => {
        if (mediaType === "video" && user.videoTrack) user.videoTrack.stop();
        if (mediaType === "audio" && user.audioTrack) user.audioTrack.stop();
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      });
      client.on("user-left", (user) => {
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      });

      // Tab close cleanup
      window.addEventListener("beforeunload", () => {
        navigator.sendBeacon(`/api/live/leave/${sessionId}`);
        client.leave();
      });

      // Load initial participants + chat
      const sessionResponse = await API.get(`/live/session/${sessionId}`);
      setParticipants(sessionResponse.data.participants || []);
      setChatMessages(sessionResponse.data.chatMessages || []);
      setHasMoreChat(sessionResponse.data.pagination?.hasNext || false);

      setJoined(true);
      startFallbackPolling();

    } catch (err) {
      console.error("❌ Join failed:", err);
      let msg = "Failed to join class. Please try again.";
      if (err.response?.status === 401) { navigate("/register"); return; }
      if (err.response?.status === 404) msg = "Live session not found or has ended.";
      if (err.response?.status === 403) msg = "You don't have permission to join this session.";
      if (err.name === "NotAllowedError") msg = "Camera/microphone permission denied.";
      alert(msg);
    } finally {
      setIsJoinLoading(false);
    }
  };

  // ── Fallback polling (only when socket is down) ─────────────────────────────
  const startFallbackPolling = () => {
    const interval = setInterval(async () => {
      if (isSocketConnected) return;
      try {
        const response = await API.get(`/live/session/${sessionId}`);
        if (!response.data) return;
        const { participants: p, chatMessages: c, session: s } = response.data;
        if (s?.isActive === false) { clearInterval(interval); return; }
        if (p) setParticipants((prev) => JSON.stringify(prev) !== JSON.stringify(p) ? p : prev);
        if (c) setChatMessages((prev) => prev.length !== c.length ? c : prev);
      } catch { /* silent */ }
    }, 30000);
    return () => clearInterval(interval);
  };

  // ── Remote user published ───────────────────────────────────────────────────
  const handleUserPublished = async (user, mediaType) => {
    try {
      await client.subscribe(user, mediaType);
      setTimeout(() => {
        if (mediaType === "video" && user.videoTrack) {
          const el = document.getElementById(`remote-${user.uid}`);
          if (el) user.videoTrack.play(`remote-${user.uid}`);
        }
        if (mediaType === "audio" && user.audioTrack) user.audioTrack.play();
      }, 200);

      setRemoteUsers((prev) => {
        const exists = prev.find((u) => u.uid === user.uid);
        return exists
          ? prev.map((u) => (u.uid === user.uid ? { ...u, ...user } : u))
          : [...prev, user];
      });
    } catch (error) {
      console.error("❌ Error subscribing to user:", error);
    }
  };

  // ── Audio toggle ────────────────────────────────────────────────────────────
  const toggleMute = async () => {
    if (isMuteLoading) return;
    const audio = localTracksRef.current?.audio;
    if (!audio) { console.warn("No audio track"); return; }

    setIsMuteLoading(true);
    try {
      if (isMuted) {
        await API.put(`/live/self-unmute/${sessionId}`);
        trackManagement.enableTrack(audio, true);
        await trackManagement.publishTrack(audio);
        setIsMuted(false);
      } else {
        await API.put(`/live/self-mute/${sessionId}`);
        trackManagement.enableTrack(audio, false);
        await trackManagement.unpublishTrack(audio);
        setIsMuted(true);
      }
    } catch (err) {
      console.error("❌ Toggle mute failed:", err);
    } finally {
      setIsMuteLoading(false);
    }
  };

  // ── Video toggle ────────────────────────────────────────────────────────────
  const toggleVideo = async () => {
    if (isVideoLoading) return;
    const video = localTracksRef.current?.video;
    if (!video) { console.warn("No video track"); return; }

    setIsVideoLoading(true);
    try {
      const enable = !isVideoOn;
      trackManagement.enableTrack(video, enable);
      setIsVideoOn(enable);
      if (enable) await trackManagement.publishTrack(video);
      else await trackManagement.unpublishTrack(video);
    } catch (err) {
      console.error("Toggle video failed:", err);
    } finally {
      setIsVideoLoading(false);
    }
  };

  // ── Hand raise ──────────────────────────────────────────────────────────────
  // FIX: Also emit via socket so teacher sees it instantly without waiting for
  // the HTTP response to come back and polling to pick it up
  const toggleHandRaise = async () => {
    if (isHandRaiseLoading) return;
    setIsHandRaiseLoading(true);
    try {
      const action = isHandRaised ? "lower" : "raise";
      await API.put(`/live/hand/${sessionId}`, { action });

      const newState = !isHandRaised;
      setIsHandRaised(newState);

      // Emit via socket so teacher's participant list updates instantly
      const currentSocket = socketRef.current;
      if (currentSocket && currentSocket.connected) {
        currentSocket.emit("toggle-hand-raise", {
          sessionId,
          userId: localStorage.getItem("userId"),
          isHandRaised: newState,
        });
      }
    } catch (err) {
      console.error("Toggle hand raise failed:", err);
    } finally {
      setIsHandRaiseLoading(false);
    }
  };

  // ── Promote / Demote student ────────────────────────────────────────────────
  // FIX: Use String() to ensure ID type consistency
  const promoteStudent = async (studentId) => {
    try {
      debugLog("Promoting student:", studentId);
      await API.post(`/live/promote/${sessionId}`, { studentId: String(studentId) });

      // Optimistically update local state so button switches immediately
      setParticipants((prev) =>
        prev.map((p) =>
          String(p.studentId) === String(studentId)
            ? { ...p, hasSpeakingPermission: true, isHandRaised: false }
            : p
        )
      );
    } catch (err) {
      console.error("Promote student failed:", err);
      alert("Failed to give speaking permission. Please try again.");
    }
  };

  const demoteStudent = async (studentId) => {
    try {
      debugLog("Demoting student:", studentId);
      await API.post(`/live/demote/${sessionId}`, { studentId: String(studentId) });

      // Optimistically update local state
      setParticipants((prev) =>
        prev.map((p) =>
          String(p.studentId) === String(studentId)
            ? { ...p, hasSpeakingPermission: false, isMuted: true }
            : p
        )
      );
    } catch (err) {
      console.error("Demote student failed:", err);
      alert("Failed to remove speaking permission. Please try again.");
    }
  };

  // ── Chat ────────────────────────────────────────────────────────────────────
  const sanitizeMessage = (text) =>
    text
      .replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;").trim();

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    try {
      await API.post(`/live/chat/${sessionId}`, { message: sanitizeMessage(newMessage) });
      setNewMessage("");
    } catch (err) {
      console.error("Send message failed:", err);
    }
  };

  const loadMoreChat = async () => {
    if (isLoadingChat || !hasMoreChat) return;
    setIsLoadingChat(true);
    try {
      const nextPage = chatPage + 1;
      const response = await API.get(`/live/session/${sessionId}?page=${nextPage}&limit=50`);
      if (response.data.chatMessages?.length > 0) {
        setChatMessages((prev) => [...response.data.chatMessages, ...prev]);
        setChatPage(nextPage);
        setHasMoreChat(response.data.pagination?.hasNext || false);
      } else {
        setHasMoreChat(false);
      }
    } catch (err) {
      console.error("Error loading more chat:", err);
    } finally {
      setIsLoadingChat(false);
    }
  };

  // ── End / Leave ─────────────────────────────────────────────────────────────
  const endLiveClassConfirmed = async () => {
    try {
      await API.put(`/live/end/${sessionId}`);
      const userRole = localStorage.getItem("role");
      navigate(userRole === "admin" ? "/admin" : "/teacher", {
        state: { message: "You have ended the lesson successfully." },
      });
    } catch (err) {
      console.error("❌ End live class failed:", err);
      alert("Failed to end class. Please try again.");
    }
  };

  const cleanupTracks = async () => {
    const audio = localTracksRef.current?.audio;
    const video = localTracksRef.current?.video;
    if (audio) {
      trackManagement.enableTrack(audio, false);
      await trackManagement.unpublishTrack(audio).catch(() => {});
      try { audio.close?.(); } catch { /* */ }
    }
    if (video) {
      trackManagement.enableTrack(video, false);
      await trackManagement.unpublishTrack(video).catch(() => {});
      try { video.close?.(); } catch { /* */ }
    }
    if (screenShareTrack) { try { screenShareTrack.close(); } catch { /* */ } }
    localTracksRef.current = { audio: null, video: null };
    setLocalTracks({ audio: null, video: null });
  };

  const leaveClass = async () => {
    try {
      await cleanupTracks();
      await client.leave();
      await API.put(`/live/leave/${sessionId}`);
      socketRef.current?.disconnect();
      setJoined(false);
      navigate(-1);
    } catch (err) {
      console.error("Leave failed:", err);
    }
  };

  const leaveClassWithRedirect = async () => {
    try {
      await cleanupTracks();
      await client.leave();
      socketRef.current?.disconnect();
      setJoined(false);
      const userRole = localStorage.getItem("role");
      navigate(
        userRole === "teacher" ? "/teacher" : userRole === "admin" ? "/admin" : "/student",
        { state: { message: "Lesson has ended by the teacher." } }
      );
    } catch {
      navigate("/student", { state: { message: "Lesson has ended." } });
    }
  };

  // ── Screen sharing ──────────────────────────────────────────────────────────
  const startScreenShare = async () => {
    if (!isTeacher) return;
    setIsScreenShareLoading(true);
    try {
      const screenTrack = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1" }, "auto");
      if (localTracksRef.current.video) {
        await trackManagement.unpublishTrack(localTracksRef.current.video).catch(() => {});
      }
      const track = Array.isArray(screenTrack) ? screenTrack[0] : screenTrack;
      await trackManagement.publishTrack(track);
      track.play("local-player");
      setScreenShareTrack(track);
      await API.post(`/live/screen-share/start/${sessionId}`);
      setIsScreenSharing(true);
    } catch (err) {
      console.error("Start screen share failed:", err);
      if (localTracksRef.current.video) {
        await trackManagement.publishTrack(localTracksRef.current.video).catch(() => {});
        localTracksRef.current.video.play("local-player");
      }
    } finally {
      setIsScreenShareLoading(false);
    }
  };

  const stopScreenShare = async () => {
    setIsScreenShareLoading(true);
    try {
      if (screenShareTrack) {
        await trackManagement.unpublishTrack(screenShareTrack).catch(() => {});
        screenShareTrack.close();
        setScreenShareTrack(null);
      }
      if (localTracksRef.current.video) {
        await trackManagement.publishTrack(localTracksRef.current.video).catch(() => {});
        localTracksRef.current.video.play("local-player");
      }
      await API.post(`/live/screen-share/stop/${sessionId}`);
      setIsScreenSharing(false);
    } catch (err) {
      console.error("Stop screen share failed:", err);
    } finally {
      setIsScreenShareLoading(false);
    }
  };

  const toggleScreenShare = () => (isScreenSharing ? stopScreenShare() : startScreenShare());

  // ── Recording ───────────────────────────────────────────────────────────────
  const startRecording = async () => {
    if (!isTeacher) return;
    setIsRecordingLoading(true);
    try {
      const response = await API.post(`/live/recording/start/${sessionId}`);
      setIsRecording(true);
      setRecordingStatus(response.data.recording);
    } catch (err) { console.error("Start recording failed:", err); }
    finally { setIsRecordingLoading(false); }
  };

  const stopRecording = async () => {
    if (!isTeacher) return;
    setIsRecordingLoading(true);
    try {
      const response = await API.post(`/live/recording/stop/${sessionId}`);
      setIsRecording(false);
      setRecordingStatus(response.data.recording);
    } catch (err) { console.error("Stop recording failed:", err); }
    finally { setIsRecordingLoading(false); }
  };

  const toggleRecording = () => (isRecording ? stopRecording() : startRecording());

  // ── Side effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const update = () => { setLastActivity(Date.now()); setShowTimeoutWarning(false); };
    ["mousemove", "keypress", "click", "scroll"].forEach((e) => document.addEventListener(e, update));
    return () => ["mousemove", "keypress", "click", "scroll"].forEach((e) => document.removeEventListener(e, update));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const inactive = Date.now() - lastActivity;
      if (inactive > 1800000 && joined) leaveClass();
      else if (inactive > 1200000 && !showTimeoutWarning && joined) setShowTimeoutWarning(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [lastActivity, showTimeoutWarning, joined]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    remoteUsers.forEach((user) => { if (user.audioTrack) user.audioTrack.setVolume(80); });
  }, [remoteUsers]);

  useEffect(() => {
    return () => {
      cleanupTracks();
      client.leave();
      socketRef.current?.disconnect();
    };
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-900 text-white">

      {/* Timeout Warning */}
      {showTimeoutWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Session Timeout Warning</h3>
            <p className="mb-4">Your session will end in 10 minutes due to inactivity.</p>
            <button
              onClick={() => { setLastActivity(Date.now()); setShowTimeoutWarning(false); }}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded w-full"
            >
              Continue Session
            </button>
          </div>
        </div>
      )}

      {/* End Class Modal */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">End Live Class</h3>
            <p className="mb-4">Are you sure you want to end this class for everyone?</p>
            <div className="flex space-x-2">
              <button
                onClick={async () => { await endLiveClassConfirmed(); setShowEndModal(false); }}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded flex-1"
              >
                Yes, end
              </button>
              <button onClick={() => setShowEndModal(false)} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-800 p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">
            🎥 {sessionInfo?.title || "Live Class"}
          </h1>
          <p className="text-gray-400 text-sm sm:text-base truncate">
            Teacher: {sessionInfo?.teacherName} | Class: {sessionInfo?.className}
          </p>
          {joined && !isTeacher && !isSpeaking && (
            <span className="inline-block bg-blue-700 text-blue-100 text-xs px-2 py-0.5 rounded mt-1">
              👥 Watching live
            </span>
          )}
          {isSpeaking && (
            <span className="inline-block bg-green-600 text-white text-xs px-2 py-0.5 rounded mt-1 animate-pulse">
              🎤 Speaking now
            </span>
          )}
        </div>

        {isMobile && (
          <button onClick={() => setShowControls(!showControls)} className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm">
            {showControls ? "Hide Controls" : "Show Controls"}
          </button>
        )}

        <div className={`flex items-center space-x-2 sm:space-x-4 ${isMobile && !showControls ? "hidden" : "flex"}`}>
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
              className={`p-2 sm:p-3 rounded-full ${isScreenSharing ? "bg-purple-600 hover:bg-purple-700" : "bg-gray-600 hover:bg-gray-700"} transition-all disabled:opacity-50`}
              title={isScreenSharing ? "Stop Screen Share" : "Start Screen Share"}
            >
              {isScreenShareLoading ? "⏳" : isScreenSharing ? "🖥️●" : "🖥️"}
            </button>
          )}

          {isTeacher && (
            <button
              onClick={toggleVideo}
              disabled={isVideoLoading}
              className={`p-2 sm:p-3 rounded-full ${isVideoOn ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"} transition-all disabled:opacity-50`}
              title={isVideoOn ? "Turn Off Video" : "Turn On Video"}
            >
              {isVideoLoading ? "⏳" : isVideoOn ? "📹" : "📷"}
            </button>
          )}

          {(isTeacher || isSpeaking) && (
            <button
              onClick={toggleMute}
              disabled={isMuteLoading}
              className={`p-2 sm:p-3 rounded-full ${isMuted ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"} transition-all disabled:opacity-50`}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuteLoading ? "⏳" : isMuted ? "🔇" : "🎤"}
            </button>
          )}

          {!isTeacher && (
            <button
              onClick={toggleHandRaise}
              disabled={isHandRaiseLoading}
              className={`p-2 sm:p-3 rounded-full ${isHandRaised ? "bg-yellow-600 hover:bg-yellow-700" : "bg-gray-600 hover:bg-gray-700"} transition-all disabled:opacity-50`}
              title={isHandRaised ? "Lower Hand" : "Raise Hand"}
            >
              {isHandRaiseLoading ? "⏳" : isHandRaised ? "✋" : "🤚"}
            </button>
          )}

          <button onClick={leaveClass} className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm transition-all">
            <span className="hidden sm:inline">Leave Class</span>
            <span className="sm:hidden">Leave</span>
          </button>
        </div>
      </div>

      {/* Mobile Chat Toggle */}
      {isMobile && (
        <div className="bg-gray-700 p-2 flex justify-center border-b border-gray-600">
          <button onClick={() => setShowChat(!showChat)} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm">
            {showChat ? "Hide Chat" : "Show Chat"}
          </button>
        </div>
      )}

      <div className={`h-[calc(100vh-80px)] ${isMobile ? "flex flex-col" : "flex"}`}>

        {/* Video Grid */}
        <div className={`${isMobile ? (showChat ? "hidden" : "flex-1") : "flex-1"} p-2 sm:p-4`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">

            {(isTeacher || isSpeaking) && (
              <div className="bg-black rounded-lg overflow-hidden relative aspect-video">
                <div id="local-player" className="w-full h-full"></div>
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-xs sm:text-sm">
                  You {isMuted && "🔇"} {!isVideoOn && !isSpeaking && "📷"} {isScreenSharing && "🖥️"}
                </div>
                {isScreenSharing && (
                  <div className="absolute top-2 left-2 bg-purple-600 px-2 py-1 rounded text-xs">Screen Sharing</div>
                )}
              </div>
            )}

            {!isTeacher && !isSpeaking && joined && (
              <div className="bg-gray-800 rounded-lg overflow-hidden relative aspect-video flex items-center justify-center col-span-full">
                <div className="text-center text-gray-400">
                  <div className="text-4xl mb-2">👥</div>
                  <p className="text-sm">You are watching the live class</p>
                  <p className="text-xs mt-1 text-gray-500">
                    {isHandRaised ? "✋ Hand raised — waiting for teacher to allow you to speak" : "Raise your hand to speak"}
                  </p>
                </div>
              </div>
            )}

            {remoteUsers.map((user) => (
              <div key={user.uid} className="bg-black rounded-lg overflow-hidden relative aspect-video">
                <div id={`remote-${user.uid}`} className="w-full h-full" style={{ background: "#000" }}>
                  <div className="absolute inset-0 flex items-center justify-center text-white">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-white mx-auto mb-1 sm:mb-2"></div>
                      <span className="text-xs sm:text-sm">Loading video...</span>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-xs sm:text-sm">
                  {user.uid}
                </div>
                <div className="absolute top-2 right-2 bg-green-600 px-2 py-1 rounded text-xs">🎥 Live</div>
              </div>
            ))}
          </div>

          {/* Teacher Controls */}
          {isTeacher && (
            <div className="mt-4 sm:mt-6 bg-gray-800 p-3 sm:p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-3">Teacher Controls</h3>

              {/* Recording */}
              <div className="mb-4 p-3 bg-red-600 bg-opacity-20 rounded">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <span className="font-semibold text-sm sm:text-base">
                      Recording: {isRecording ? "🔴 RECORDING" : "⏸️ NOT RECORDING"}
                    </span>
                    {isRecording && recordingStatus?.startTime && (
                      <div className="text-xs text-gray-300">
                        Started: {new Date(recordingStatus.startTime).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={toggleRecording}
                    disabled={isRecordingLoading}
                    className={`px-3 py-1 rounded text-sm ${isRecording ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"} disabled:opacity-50`}
                  >
                    {isRecordingLoading ? "⏳" : isRecording ? "⏹️ Stop" : "🔴 Start"}
                  </button>
                </div>
              </div>

              {/* Screen Sharing */}
              <div className="mb-4 p-3 bg-purple-600 bg-opacity-20 rounded">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className="font-semibold text-sm sm:text-base">
                    Screen Sharing: {isScreenSharing ? "ACTIVE" : "INACTIVE"}
                  </span>
                  <button
                    onClick={toggleScreenShare}
                    disabled={isScreenShareLoading}
                    className={`px-3 py-1 rounded text-sm ${isScreenSharing ? "bg-red-600 hover:bg-red-700" : "bg-purple-600 hover:bg-purple-700"} disabled:opacity-50`}
                  >
                    {isScreenShareLoading ? "⏳" : isScreenSharing ? "Stop" : "Start"}
                  </button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={async () => {
                    const r = await API.get(`/live/session/${sessionId}`);
                    if (r.data.participants) setParticipants(r.data.participants);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm flex-1 min-w-[120px]"
                >
                  🔄 Refresh
                </button>
                <button
                  onClick={() => setShowEndModal(true)}
                  className="bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded text-sm flex-1 min-w-[120px]"
                >
                  🛑 End Class
                </button>
              </div>

              {/* Participants list */}
              <div>
                <h4 className="font-semibold mb-2">Participants ({participants.length})</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {participants.map((participant) => {
                    // FIX: Check both "role" and "sessionRole" fields since backend
                    // may return either depending on which populate path ran
                    const isHost =
                      participant.sessionRole === "host" ||
                      participant.role === "host";

                    return (
                      <div key={participant.studentId} className="flex items-center justify-between bg-gray-700 p-2 rounded">
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                          <span className="truncate text-sm">
                            {participant.name}
                            {isHost && " 👨‍🏫"}
                          </span>
                          {participant.isHandRaised && (
                            <span className="text-yellow-400 animate-pulse flex-shrink-0">✋</span>
                          )}
                          {participant.isMuted ? (
                            <span className="text-red-400 flex-shrink-0 text-xs">🔇</span>
                          ) : (
                            <span className="text-green-400 flex-shrink-0 text-xs">🎤</span>
                          )}
                          {participant.hasSpeakingPermission && (
                            <span className="bg-green-700 text-green-100 text-xs px-1 rounded flex-shrink-0">
                              Speaking
                            </span>
                          )}
                        </div>

                        {/* FIX: Show Allow/Mute buttons for all non-host participants */}
                        {!isHost && (
                          <div className="flex gap-1 ml-2 flex-shrink-0">
                            {participant.hasSpeakingPermission ? (
                              <button
                                onClick={() => demoteStudent(participant.studentId)}
                                className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs whitespace-nowrap"
                                title="Remove speaking permission"
                              >
                                Mute
                              </button>
                            ) : (
                              <button
                                onClick={() => promoteStudent(participant.studentId)}
                                className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs whitespace-nowrap"
                                title="Allow this student to speak"
                              >
                                Allow
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chat Panel */}
        <div className={`${isMobile ? (showChat ? "flex-1 flex flex-col" : "hidden") : "w-80"} bg-gray-800 flex flex-col`}>
          <div className="p-4 border-b border-gray-700">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">Chat</h3>
              {isMobile && (
                <button onClick={() => setShowChat(false)} className="bg-gray-600 hover:bg-gray-700 px-2 py-1 rounded text-sm">
                  Close
                </button>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-1">{chatMessages.length} messages</div>
          </div>

          <div
            ref={chatContainerRef}
            role="log"
            aria-label="Chat messages"
            aria-live="polite"
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
                <div
                  key={index}
                  className={`p-2 rounded ${
                    message.messageType === "system" ? "bg-blue-600 bg-opacity-20" :
                    message.messageType === "permission_granted" ? "bg-green-600 bg-opacity-20" :
                    message.messageType === "permission_revoked" ? "bg-red-600 bg-opacity-20" :
                    "bg-gray-700"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-semibold text-sm">{message.userName}</span>
                    <span className="text-xs text-gray-400">{new Date(message.timestamp).toLocaleTimeString()}</span>
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
                onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 bg-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={sendMessage} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm">
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Join overlay */}
      {!joined && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center">
          <div className="bg-gray-800 p-6 sm:p-8 rounded-lg text-center mx-4 max-w-md w-full">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">Join Live Class</h2>
            <p className="text-gray-400 mb-2">{sessionInfo?.title || "Loading session..."}</p>
            <p className="text-gray-500 text-sm mb-6">
              {localStorage.getItem("role") === "teacher"
                ? "You will join as the teacher (host)"
                : "You will join as a viewer. Raise your hand to speak."}
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