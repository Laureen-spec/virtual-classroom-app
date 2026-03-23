import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AgoraRTC from "agora-rtc-sdk-ng";
import API from "../api/axios";
import io from "socket.io-client";

// ─── Create ONE client for the lifetime of the app, not per render ───────────
// Mode "live" = live streaming. Teachers are "host", students are "audience".
// Audience members consume a fraction of the minutes that RTC peers do.
const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });

export default function LiveClass() {
  const navigate = useNavigate();
  const { sessionId } = useParams();

  // ── Core state ──────────────────────────────────────────────────────────────
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

  // ── Speaking state (for promoted audience students) ─────────────────────────
  const [isSpeaking, setIsSpeaking] = useState(false); // student promoted to host

  // ── Socket ──────────────────────────────────────────────────────────────────
  const [socket, setSocket] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  // ── Screen sharing ──────────────────────────────────────────────────────────
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareTrack, setScreenShareTrack] = useState(null);

  // ── Recording ───────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState(null);

  // ── Chat pagination ─────────────────────────────────────────────────────────
  const [chatPage, setChatPage] = useState(1);
  const [hasMoreChat, setHasMoreChat] = useState(true);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  // ── Session timeout ─────────────────────────────────────────────────────────
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);

  // ── Mobile ──────────────────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // ── Loading guards ──────────────────────────────────────────────────────────
  const [isMuteLoading, setIsMuteLoading] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [isHandRaiseLoading, setIsHandRaiseLoading] = useState(false);
  const [isScreenShareLoading, setIsScreenShareLoading] = useState(false);
  const [isRecordingLoading, setIsRecordingLoading] = useState(false);
  const [isJoinLoading, setIsJoinLoading] = useState(false);

  // ── Modal ───────────────────────────────────────────────────────────────────
  const [showEndModal, setShowEndModal] = useState(false);

  const appId = import.meta.env.VITE_AGORA_APP_ID;
  const chatContainerRef = useRef(null);
  const localTracksRef = useRef({ audio: null, video: null });

  const isDevelopment = import.meta.env.DEV;
  const debugLog = (...args) => { if (isDevelopment) console.log(...args); };

  // ════════════════════════════════════════════════════════════════════════════
  // Track management helpers
  // ════════════════════════════════════════════════════════════════════════════
  const trackManagement = {
    publishTrack: async (track) => {
      try {
        await client.publish([track]);
        return true;
      } catch (error) {
        console.error("❌ Error publishing track:", error);
        return false;
      }
    },
    unpublishTrack: async (track) => {
      try {
        await client.unpublish([track]);
        return true;
      } catch (error) {
        try { await client.unpublish(track); return true; } catch { return false; }
      }
    },
    enableTrack: (track, enabled) => {
      if (track) {
        try { track.setEnabled(enabled); } catch (e) { console.error("enableTrack failed:", e); }
      }
    },
  };

  // ════════════════════════════════════════════════════════════════════════════
  // Socket setup
  // ════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const newSocket = io("https://virtual-classroom-app-8wbh.onrender.com", {
      transports: ["websocket"],
      withCredentials: true,
    });

    newSocket.on("connect", () => { setIsSocketConnected(true); });
    newSocket.on("disconnect", () => { setIsSocketConnected(false); });
    newSocket.on("connect_error", () => { setIsSocketConnected(false); });

    setSocket(newSocket);
    return () => { newSocket.disconnect(); };
  }, []);

  // ── Join socket room once connected and in-class ────────────────────────────
  useEffect(() => {
    if (socket && isSocketConnected && joined && sessionId) {
      socket.emit("join-session", {
        sessionId,
        userId: localStorage.getItem("userId"),
        userRole: localStorage.getItem("role"),
      });
    }
  }, [socket, isSocketConnected, joined, sessionId]);

  // ── Socket event listeners ──────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Real-time chat — no polling needed
    socket.on("new-chat-message", (message) => {
      setChatMessages((prev) => [...prev, message]);
    });

    // Participant updates
    socket.on("participant-updated", (data) => {
      setParticipants((prev) =>
        prev.map((p) => (p.studentId === data.studentId ? { ...p, ...data } : p))
      );
    });

    // Hand raise notification (teacher sees it highlighted)
    socket.on("hand-raised", (data) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.studentId === data.studentId ? { ...p, isHandRaised: true } : p
        )
      );
    });

    // Session ended by teacher
    socket.on("session-ended", () => {
      alert("Lesson has ended by the teacher. You will be redirected.");
      leaveClassWithRedirect();
    });

    // ── Student promoted to speaker ────────────────────────────────────────
    // The teacher called /promote; the backend sent this event with a fresh
    // PUBLISHER token. This student switches to host role and creates a mic track.
    socket.on("student-promoted", async ({ studentId, speakerToken, channelName }) => {
      const myId = localStorage.getItem("userId");
      if (studentId !== myId) return; // not me

      try {
        // Switch Agora client role to host
        await client.setClientRole("host");

        // Create and publish mic track
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localTracksRef.current.audio = audioTrack;
        setLocalTracks((prev) => ({ ...prev, audio: audioTrack }));

        await trackManagement.publishTrack(audioTrack);
        setIsMuted(false);
        setIsSpeaking(true);

        debugLog("✅ Promoted to speaker");
      } catch (err) {
        console.error("Failed to switch to speaker:", err);
      }
    });

    // ── Student demoted back to audience ───────────────────────────────────
    socket.on("student-demoted", async ({ studentId }) => {
      const myId = localStorage.getItem("userId");
      if (studentId !== myId) return;

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

        debugLog("✅ Demoted back to audience");
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

  // ════════════════════════════════════════════════════════════════════════════
  // Join class
  // ════════════════════════════════════════════════════════════════════════════
  const joinClass = async () => {
    try {
      setIsJoinLoading(true);

      const token = localStorage.getItem("token");
      const userRole = localStorage.getItem("role");

      // Admin fallback
      if (userRole === "admin" && !localStorage.getItem("userId")) {
        localStorage.setItem("userId", "69025078d9063907000b4d59");
      }

      if (!token) {
        navigate("/register");
        return;
      }

      // ── Request media permissions (teachers need cam+mic; students need nothing) ─
      if (userRole !== "admin" && userRole !== "student") {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          alert("Microphone and camera access is required to teach the class.");
          return;
        }
      }

      // ── API join ────────────────────────────────────────────────────────────
      const joinResponse = await API.post(`/live/join/${sessionId}`);
      const { session, token: agoraToken, participantInfo } = joinResponse.data;

      setSessionInfo(session);
      setParticipantInfo(participantInfo);

      const isHost = session.isHost; // backend decided
      const isUserTeacher = isHost;
      setIsTeacher(isUserTeacher);
      setIsMuted(!isHost);
      setIsVideoOn(isHost);

      // ── Set Agora client role BEFORE joining channel ────────────────────────
      // This is the key change: audience members don't publish anything,
      // so Agora only bills for the single host stream delivery.
      if (isHost) {
        await client.setClientRole("host");
      } else {
        await client.setClientRole("audience", { level: 1 });
        // level 1 = low latency (~1-2s delay). Cheaper than level 0 (ultra-low).
      }

      await client.join(appId, session.channelName, agoraToken, null);

      // ── Tracks: only hosts create and publish them ──────────────────────────
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
        // Students: no tracks, no publish, no minutes consumed
        // They will receive the teacher's stream automatically via subscription
        localTracksRef.current = { audio: null, video: null };
        debugLog("✅ Joined as audience — zero track cost");
      }

      // ── Remote user handler ─────────────────────────────────────────────────
      client.on("user-published", handleUserPublished);

      client.on("user-unpublished", (user, mediaType) => {
        if (mediaType === "video" && user.videoTrack) user.videoTrack.stop();
        if (mediaType === "audio" && user.audioTrack) user.audioTrack.stop();
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      });

      client.on("user-left", (user) => {
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      });

      // ── Tab close cleanup ───────────────────────────────────────────────────
      const handleUnload = () => {
        navigator.sendBeacon
          ? navigator.sendBeacon(`/api/live/leave/${sessionId}`)
          : API.put(`/live/leave/${sessionId}`).catch(() => {});
        client.leave();
      };
      window.addEventListener("beforeunload", handleUnload);

      // ── Load initial session data (participants + first page of chat) ───────
      const sessionResponse = await API.get(`/live/session/${sessionId}`);
      setParticipants(sessionResponse.data.participants || []);
      setChatMessages(sessionResponse.data.chatMessages || []);
      setHasMoreChat(sessionResponse.data.pagination?.hasNext || false);

      setJoined(true);

      // ── Start LIGHT polling only as fallback if socket is down ─────────────
      startFallbackPolling();

    } catch (err) {
      console.error("❌ Join failed:", err);

      let errorMessage = "Failed to join class. Please try again.";
      if (err.response?.status === 401) { navigate("/register"); return; }
      if (err.response?.status === 404) errorMessage = "Live session not found or has ended.";
      if (err.response?.status === 403) errorMessage = "You don't have permission to join this session.";
      if (err.name === "NotAllowedError") errorMessage = "Camera/microphone permission denied.";

      alert(errorMessage);
    } finally {
      setIsJoinLoading(false);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // Fallback polling — only runs if socket is disconnected, every 30 s max
  // ════════════════════════════════════════════════════════════════════════════
  const startFallbackPolling = () => {
    const interval = setInterval(async () => {
      if (isSocketConnected) return; // socket is up — skip

      try {
        const response = await API.get(`/live/session/${sessionId}`);
        if (!response.data) return;

        const { participants: p, chatMessages: c, session: s } = response.data;

        if (s?.isActive === false) { clearInterval(interval); return; }
        if (p) setParticipants((prev) => JSON.stringify(prev) !== JSON.stringify(p) ? p : prev);
        if (c) setChatMessages((prev) => prev.length !== c.length ? c : prev);
      } catch { /* silent */ }
    }, 30000); // 30 seconds — 6× slower than before

    return () => clearInterval(interval);
  };

  // ════════════════════════════════════════════════════════════════════════════
  // Remote user published handler
  // ════════════════════════════════════════════════════════════════════════════
  const handleUserPublished = async (user, mediaType) => {
    try {
      await client.subscribe(user, mediaType);

      setTimeout(() => {
        if (mediaType === "video" && user.videoTrack) {
          const el = document.getElementById(`remote-${user.uid}`);
          if (el) user.videoTrack.play(`remote-${user.uid}`);
        }
        if (mediaType === "audio" && user.audioTrack) {
          user.audioTrack.play();
        }
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

  // ════════════════════════════════════════════════════════════════════════════
  // Audio toggle — only relevant for hosts and promoted speakers
  // ════════════════════════════════════════════════════════════════════════════
  const toggleMute = async () => {
    if (isMuteLoading) return;

    const audio = localTracksRef.current?.audio;
    if (!audio) {
      console.warn("No audio track — audience members cannot self-unmute");
      return;
    }

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

  // ════════════════════════════════════════════════════════════════════════════
  // Video toggle — only hosts have a video track
  // ════════════════════════════════════════════════════════════════════════════
  const toggleVideo = async () => {
    if (isVideoLoading) return;

    const video = localTracksRef.current?.video;
    if (!video) {
      console.warn("No video track — audience members have no camera");
      return;
    }

    setIsVideoLoading(true);
    try {
      const enable = !isVideoOn;
      trackManagement.enableTrack(video, enable);
      setIsVideoOn(enable);

      if (enable) {
        await trackManagement.publishTrack(video);
      } else {
        await trackManagement.unpublishTrack(video);
      }
    } catch (err) {
      console.error("Toggle video failed:", err);
    } finally {
      setIsVideoLoading(false);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // Hand raise
  // ════════════════════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════════════════════
  // Teacher: promote / demote student to speaker
  // ════════════════════════════════════════════════════════════════════════════
  const promoteStudent = async (studentId) => {
    try {
      await API.post(`/live/promote/${sessionId}`, { studentId });
      // Backend emits socket event to the student — no extra work here
    } catch (err) {
      console.error("Promote student failed:", err);
    }
  };

  const demoteStudent = async (studentId) => {
    try {
      await API.post(`/live/demote/${sessionId}`, { studentId });
    } catch (err) {
      console.error("Demote student failed:", err);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // Chat
  // ════════════════════════════════════════════════════════════════════════════
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
      // Backend socket broadcast adds the message to chatMessages via socket listener
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
      console.error("Error loading more chat messages:", err);
    } finally {
      setIsLoadingChat(false);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // End / Leave
  // ════════════════════════════════════════════════════════════════════════════
  const endLiveClassConfirmed = async () => {
    try {
      await API.put(`/live/end/${sessionId}`);
      // Backend emits session-ended to all clients via socket
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
    if (screenShareTrack) {
      try { screenShareTrack.close(); } catch { /* */ }
    }

    localTracksRef.current = { audio: null, video: null };
    setLocalTracks({ audio: null, video: null });
  };

  const leaveClass = async () => {
    try {
      await cleanupTracks();
      await client.leave();
      await API.put(`/live/leave/${sessionId}`);
      socket?.disconnect();
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
      socket?.disconnect();
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

  // ════════════════════════════════════════════════════════════════════════════
  // Screen sharing (teacher only)
  // ════════════════════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════════════════════
  // Recording
  // ════════════════════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════════════════════
  // Side effects
  // ════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Activity tracker
  useEffect(() => {
    const update = () => { setLastActivity(Date.now()); setShowTimeoutWarning(false); };
    ["mousemove", "keypress", "click", "scroll"].forEach((e) => document.addEventListener(e, update));
    return () => ["mousemove", "keypress", "click", "scroll"].forEach((e) => document.removeEventListener(e, update));
  }, []);

  // Timeout checker
  useEffect(() => {
    const interval = setInterval(() => {
      const inactive = Date.now() - lastActivity;
      if (inactive > 1800000 && joined) leaveClass();
      else if (inactive > 1200000 && !showTimeoutWarning && joined) setShowTimeoutWarning(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [lastActivity, showTimeoutWarning, joined]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Remote audio volume
  useEffect(() => {
    remoteUsers.forEach((user) => { if (user.audioTrack) user.audioTrack.setVolume(80); });
  }, [remoteUsers]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      cleanupTracks();
      client.leave();
      socket?.disconnect();
    };
  }, []);

  // ════════════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════════════
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
          {/* Show audience badge for students */}
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

          {/* Screen share — teacher only */}
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

          {/* Video — teacher only (students are audience, no cam) */}
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

          {/* Mic — teacher always, students only when promoted to speaker */}
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

          {/* Hand raise — students only */}
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

        {/* ── Video Grid ────────────────────────────────────────────────────── */}
        <div className={`${isMobile ? (showChat ? "hidden" : "flex-1") : "flex-1"} p-2 sm:p-4`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">

            {/* Local player — only visible to teacher/speaking student */}
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

            {/* Audience placeholder when student is watching */}
            {!isTeacher && !isSpeaking && joined && (
              <div className="bg-gray-800 rounded-lg overflow-hidden relative aspect-video flex items-center justify-center col-span-full">
                <div className="text-center text-gray-400">
                  <div className="text-4xl mb-2">👥</div>
                  <p className="text-sm">You are watching the live class</p>
                  <p className="text-xs mt-1 text-gray-500">Raise your hand to speak</p>
                </div>
              </div>
            )}

            {/* Remote users (teacher's stream + any promoted speakers) */}
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

          {/* ── Teacher Controls ─────────────────────────────────────────── */}
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

              {/* Participants list with promote/demote buttons */}
              <div>
                <h4 className="font-semibold mb-2">Participants ({participants.length})</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {participants.map((participant) => (
                    <div key={participant.studentId} className="flex items-center justify-between bg-gray-700 p-2 rounded">
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        <span className="truncate text-sm">
                          {participant.name}
                          {participant.sessionRole === "host" && " 👨‍🏫"}
                        </span>
                        {participant.isHandRaised && <span className="text-yellow-400 animate-pulse flex-shrink-0">✋</span>}
                        {participant.isMuted ? (
                          <span className="text-red-400 flex-shrink-0">🔇</span>
                        ) : (
                          <span className="text-green-400 flex-shrink-0">🎤</span>
                        )}
                        {participant.hasSpeakingPermission && (
                          <span className="text-green-400 text-xs flex-shrink-0">Speaking</span>
                        )}
                      </div>

                      {/* Only show promote/demote for audience students */}
                      {participant.sessionRole !== "host" && (
                        <div className="flex gap-1 ml-2">
                          {participant.hasSpeakingPermission ? (
                            <button
                              onClick={() => demoteStudent(participant.studentId)}
                              className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs"
                              title="Remove speaking permission"
                            >
                              Mute
                            </button>
                          ) : (
                            <button
                              onClick={() => promoteStudent(participant.studentId)}
                              className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs"
                              title="Allow this student to speak"
                            >
                              Allow
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Chat Panel ────────────────────────────────────────────────────── */}
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