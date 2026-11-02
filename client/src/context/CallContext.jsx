/* eslint-disable react-refresh/only-export-components */
/* eslint-disable no-empty */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AuthContext } from "./AuthContext";
import { ChatContext } from "./ChatContext";
import { createPeerConnection, getLocalStream, stopStream } from "../lib/webrtc";
import { sid, idEq } from "../lib/utils";
import toast from "react-hot-toast";

export const CallContext = createContext();

// Lightweight Web Audio API ringtone generator (zero external asset dependencies)
const createRingtone = () => {
  let ctx = null;
  let interval = null;

  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioCtx();
      }
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(480, now);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.2);
      osc2.stop(now + 1.2);
    } catch {}
  };

  return {
    start: () => {
      try {
        if (interval) clearInterval(interval);
        playChime();
        interval = setInterval(playChime, 3000);
      } catch {}
    },
    stop: () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (ctx && ctx.state !== "closed") {
        try {
          ctx.close();
        } catch {}
        ctx = null;
      }
    },
  };
};

export const CallProvider = ({ children }) => {
  const { socket, authUser, onlineUser } = useContext(AuthContext);
  const { logCall, users } = useContext(ChatContext);

  const [callState, setCallState] = useState({
    status: "idle",
    kind: null,
    peer: null,
    localStream: null,
    remoteStream: null,
    muted: false,
    cameraOff: false,
    startedAt: null,
    connectionState: null,
    iceState: null,
  });

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const incomingOfferRef = useRef(null);
  const callStateRef = useRef(callState);
  const usersRef = useRef(users);

  // Concurrency & state safety locks
  const isStartingRef = useRef(false);
  const isAcceptingRef = useRef(false);
  const currentCallIdRef = useRef(null);
  const ringTimeoutRef = useRef(null);
  const ringtoneRef = useRef(createRingtone());

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  const cleanup = useCallback(() => {
    ringtoneRef.current.stop();

    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }

    try {
      if (pcRef.current) {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
        pcRef.current = null;
      }
    } catch {}

    if (localStreamRef.current) {
      stopStream(localStreamRef.current);
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      stopStream(remoteStreamRef.current);
      remoteStreamRef.current = null;
    }

    setCallState((prev) => {
      stopStream(prev.localStream);
      stopStream(prev.remoteStream);
      return {
        status: "idle",
        kind: null,
        peer: null,
        localStream: null,
        remoteStream: null,
        muted: false,
        cameraOff: false,
        startedAt: null,
        connectionState: null,
        iceState: null,
      };
    });

    pendingCandidatesRef.current = [];
    incomingOfferRef.current = null;
    currentCallIdRef.current = null;
    isStartingRef.current = false;
    isAcceptingRef.current = false;
  }, []);

  const attachPcHandlers = useCallback(
    (pc) => {
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        setCallState((prev) => ({ ...prev, connectionState: st }));
        if (st === "failed") {
          toast.error(
            "Call could not connect. Check network connection and allow camera & microphone."
          );
          setTimeout(() => cleanup(), 1500);
        }
      };

      pc.oniceconnectionstatechange = () => {
        setCallState((prev) => ({
          ...prev,
          iceState: pc.iceConnectionState,
        }));
        if (pc.iceConnectionState === "failed") {
          toast.error("Network blocked the call (ICE failed). Try again on the same network.");
          setTimeout(() => cleanup(), 2000);
        }
      };
    },
    [cleanup]
  );

  const startCall = useCallback(
    async (peer, kind = "audio") => {
      if (!socket || !peer) return;

      // Prevent duplicate call starts from rapid double-clicks
      if (isStartingRef.current || callStateRef.current.status !== "idle") {
        return;
      }
      isStartingRef.current = true;

      const peerId = sid(peer._id);

      if (!socket.connected) {
        toast.error("You are not connected to the server. Check your network.", {
          duration: 4000,
        });
        isStartingRef.current = false;
        return;
      }

      const peerOnline = (onlineUser || []).some((id) => idEq(id, peer._id));
      if (!peerOnline) {
        toast.error("Contact is currently offline.", { duration: 4000 });
        isStartingRef.current = false;
        return;
      }

      const callId = `${sid(authUser._id)}_${Date.now()}`;
      currentCallIdRef.current = callId;
      pendingCandidatesRef.current = [];
      remoteStreamRef.current = new MediaStream();

      try {
        const stream = await getLocalStream({
          audio: true,
          video: kind === "video",
        });
        localStreamRef.current = stream;

        if (stream._cameraUnavailable && kind === "video") {
          toast("Camera is unavailable. Started call with audio only.", {
            icon: "⚠️",
            duration: 4000,
          });
        }

        const pc = createPeerConnection({
          onIceCandidate: (candidate) => {
            if (candidate) {
              socket.emit("call:ice", { to: peerId, candidate, callId });
            }
          },
          onTrack: (remoteStream, track) => {
            if (!remoteStreamRef.current) {
              remoteStreamRef.current = new MediaStream();
            }
            if (track) {
              if (!remoteStreamRef.current.getTracks().some((t) => t.id === track.id)) {
                remoteStreamRef.current.addTrack(track);
              }
            } else if (remoteStream) {
              remoteStream.getTracks().forEach((t) => {
                if (!remoteStreamRef.current.getTracks().some((x) => x.id === t.id)) {
                  remoteStreamRef.current.addTrack(t);
                }
              });
            }

            const combined = new MediaStream(remoteStreamRef.current.getTracks());
            setCallState((prev) => ({
              ...prev,
              remoteStream: combined,
            }));
          },
        });
        attachPcHandlers(pc);

        pcRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("call:invite", {
          to: peerId,
          kind,
          offer: { type: offer.type, sdp: offer.sdp },
          caller: {
            _id: sid(authUser._id),
            fullName: authUser.fullName,
            profilePic: authUser.profilePic,
          },
          callId,
        });

        setCallState({
          status: "calling",
          kind,
          peer: { ...peer, _id: peerId },
          localStream: stream,
          remoteStream: null,
          muted: false,
          cameraOff: false,
          startedAt: null,
          connectionState: pc.connectionState,
          iceState: pc.iceConnectionState,
        });

        // 45-second auto-timeout if callee does not answer
        ringTimeoutRef.current = setTimeout(() => {
          if (callStateRef.current.status === "calling") {
            toast("No answer", { icon: "📞" });
            socket.emit("call:cancel", { to: peerId, callId });
            logCall({
              receiverId: peerId,
              kind,
              status: "missed",
              duration: 0,
            });
            cleanup();
          }
        }, 45000);
      } catch (err) {
        console.error("startCall error", err);
        const isVideoCall = kind === "video";
        let message = "Cannot start call. Check permissions.";
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          message = isVideoCall
            ? "Camera and microphone access was denied. Please allow them in your browser settings."
            : "Microphone access was denied. Please allow it in your browser settings.";
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          message = isVideoCall
            ? "Camera or microphone not found on this device."
            : "No microphone found on this device.";
        } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
          message = "Camera or microphone is already in use by another application.";
        } else if (err.name === "OverconstrainedError") {
          message = "Camera does not support requested settings.";
        }
        toast.error(message, { duration: 5000 });
        cleanup();
      } finally {
        isStartingRef.current = false;
      }
    },
    [socket, authUser, onlineUser, cleanup, attachPcHandlers, logCall]
  );

  const acceptCall = useCallback(async () => {
    if (!socket) return;

    // Prevent duplicate accept triggers from rapid clicking
    if (isAcceptingRef.current || callStateRef.current.status !== "incoming") {
      return;
    }
    isAcceptingRef.current = true;

    ringtoneRef.current.stop();
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }

    const offer = incomingOfferRef.current;
    const { peer, kind } = callStateRef.current;
    if (!offer || !peer) {
      isAcceptingRef.current = false;
      return;
    }

    const peerId = sid(peer._id);
    const callId = currentCallIdRef.current;
    remoteStreamRef.current = new MediaStream();

    try {
      const stream = await getLocalStream({
        audio: true,
        video: kind === "video",
      });
      localStreamRef.current = stream;

      if (stream._cameraUnavailable && kind === "video") {
        toast("Camera is unavailable. Connected with audio only.", {
          icon: "⚠️",
          duration: 4000,
        });
      }

      const pc = createPeerConnection({
        onIceCandidate: (candidate) => {
          if (candidate) {
            socket.emit("call:ice", { to: peerId, candidate, callId });
          }
        },
        onTrack: (remoteStream, track) => {
          if (!remoteStreamRef.current) {
            remoteStreamRef.current = new MediaStream();
          }
          if (track) {
            if (!remoteStreamRef.current.getTracks().some((t) => t.id === track.id)) {
              remoteStreamRef.current.addTrack(track);
            }
          } else if (remoteStream) {
            remoteStream.getTracks().forEach((t) => {
              if (!remoteStreamRef.current.getTracks().some((x) => x.id === t.id)) {
                remoteStreamRef.current.addTrack(t);
              }
            });
          }

          const combined = new MediaStream(remoteStreamRef.current.getTracks());
          setCallState((prev) => ({
            ...prev,
            remoteStream: combined,
          }));
        },
      });
      attachPcHandlers(pc);

      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(
        new RTCSessionDescription({
          type: offer.type || "offer",
          sdp: offer.sdp,
        })
      );

      for (const c of pendingCandidatesRef.current) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {
          console.warn("Failed to add buffered candidate:", e);
        }
      }
      pendingCandidatesRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("call:answer", {
        to: peerId,
        answer: { type: answer.type, sdp: answer.sdp },
        callId,
      });

      setCallState((prev) => ({
        ...prev,
        status: "active",
        localStream: stream,
        startedAt: Date.now(),
        connectionState: pc.connectionState,
        iceState: pc.iceConnectionState,
      }));
    } catch (err) {
      console.error("acceptCall error", err);
      const isVideoCall = kind === "video";
      let message = "Could not accept call. Check permissions.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        message = isVideoCall
          ? "Camera and microphone access was denied. Please allow them in browser settings."
          : "Microphone access was denied. Please allow it in browser settings.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        message = isVideoCall
          ? "Camera or microphone not found on this device."
          : "No microphone found on this device.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        message = "Camera or microphone is already in use by another application.";
      }
      toast.error(message, { duration: 5000 });
      socket.emit("call:reject", { to: peerId, reason: "error", callId });
      cleanup();
    } finally {
      isAcceptingRef.current = false;
    }
  }, [socket, cleanup, attachPcHandlers]);

  const rejectCall = useCallback(() => {
    ringtoneRef.current.stop();
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }

    if (!socket) return;
    const peer = callStateRef.current.peer;
    const kind = callStateRef.current.kind;
    const callId = currentCallIdRef.current;
    if (peer) {
      socket.emit("call:reject", {
        to: sid(peer._id),
        reason: "declined",
        callId,
      });
      logCall({
        receiverId: sid(peer._id),
        kind,
        status: "rejected",
        duration: 0,
      });
    }
    cleanup();
  }, [socket, cleanup, logCall]);

  const endCall = useCallback(() => {
    ringtoneRef.current.stop();
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }

    if (!socket) return;
    const { peer, startedAt, status, kind } = callStateRef.current;
    const callId = currentCallIdRef.current;
    if (peer) {
      const peerId = sid(peer._id);
      const duration = startedAt
        ? Math.floor((Date.now() - startedAt) / 1000)
        : 0;
      if (status === "calling") {
        socket.emit("call:cancel", { to: peerId, callId });
        logCall({
          receiverId: peerId,
          kind,
          status: "missed",
          duration: 0,
        });
      } else {
        socket.emit("call:end", { to: peerId, callId });
        if (status === "active" || startedAt) {
          logCall({
            receiverId: peerId,
            kind,
            status: "ended",
            duration,
          });
        }
      }
    }
    cleanup();
  }, [socket, cleanup, logCall]);

  const toggleMute = useCallback(() => {
    setCallState((prev) => {
      const stream = localStreamRef.current || prev.localStream;
      if (!stream) return prev;
      const willBeMuted = !prev.muted;
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        toast.error("No microphone track found");
        return prev;
      }
      audioTracks.forEach((t) => {
        t.enabled = !willBeMuted;
      });
      return { ...prev, muted: willBeMuted };
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setCallState((prev) => {
      const stream = localStreamRef.current || prev.localStream;
      if (!stream) return prev;
      const willBeOff = !prev.cameraOff;
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length === 0) {
        toast.error("No camera track found");
        return prev;
      }
      videoTracks.forEach((t) => {
        t.enabled = !willBeOff;
      });
      return { ...prev, cameraOff: willBeOff };
    });
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleIncoming = ({ from, kind, offer, caller, callId }) => {
      const fromId = sid(from);

      // If already in a call or already receiving another call, reject with busy reason
      if (callStateRef.current.status !== "idle") {
        socket.emit("call:reject", { to: fromId, reason: "busy", callId });
        return;
      }

      currentCallIdRef.current = callId || `${fromId}_${Date.now()}`;
      incomingOfferRef.current = offer;

      const peer =
        caller && caller._id
          ? { ...caller, _id: sid(caller._id) }
          : (() => {
              const u = usersRef.current.find((x) => sid(x._id) === fromId);
              return u || { _id: fromId, fullName: "Unknown" };
            })();

      setCallState({
        status: "incoming",
        kind,
        peer,
        localStream: null,
        remoteStream: null,
        muted: false,
        cameraOff: false,
        startedAt: null,
        connectionState: null,
        iceState: null,
      });

      // Start ringing audio feedback
      ringtoneRef.current.start();

      // Auto-dismiss incoming call after 45s of no response
      ringTimeoutRef.current = setTimeout(() => {
        if (callStateRef.current.status === "incoming") {
          toast("Missed call", { icon: "📞" });
          cleanup();
        }
      }, 45000);
    };

    const handleAnswered = async ({ answer, callId }) => {
      if (callId && currentCallIdRef.current && callId !== currentCallIdRef.current) {
        return;
      }

      if (ringTimeoutRef.current) {
        clearTimeout(ringTimeoutRef.current);
        ringTimeoutRef.current = null;
      }

      try {
        const pc = pcRef.current;
        if (!pc || !answer) return;
        await pc.setRemoteDescription(
          new RTCSessionDescription({
            type: answer.type || "answer",
            sdp: answer.sdp,
          })
        );
        for (const c of pendingCandidatesRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          } catch (e) {
            console.warn("Candidate add failed:", e);
          }
        }
        pendingCandidatesRef.current = [];
        setCallState((prev) => ({
          ...prev,
          status: "active",
          startedAt: Date.now(),
          connectionState: pc.connectionState,
          iceState: pc.iceConnectionState,
        }));
      } catch (e) {
        console.error("answer err", e);
        toast.error("Could not complete the call handshake.");
        cleanup();
      }
    };

    const handleIce = async ({ candidate, callId }) => {
      if (!candidate) return;
      if (callId && currentCallIdRef.current && callId !== currentCallIdRef.current) {
        return;
      }
      try {
        const pc = pcRef.current;
        if (pc?.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingCandidatesRef.current.push(candidate);
        }
      } catch (e) {
        console.error("ice err", e);
      }
    };

    const handleRejected = ({ reason, callId }) => {
      if (callId && currentCallIdRef.current && callId !== currentCallIdRef.current) {
        return;
      }

      if (reason === "busy") {
        toast.error("Contact is currently on another call.", {
          duration: 4000,
        });
      } else {
        toast("Call declined", { icon: "📞" });
      }

      const peer = callStateRef.current.peer;
      const kind = callStateRef.current.kind;
      if (peer) {
        logCall({
          receiverId: sid(peer._id),
          kind,
          status: "rejected",
          duration: 0,
        });
      }
      cleanup();
    };

    const handleEnded = ({ reason, callId }) => {
      if (callId && currentCallIdRef.current && callId !== currentCallIdRef.current) {
        return;
      }

      if (reason === "disconnected") {
        toast.error("Call ended — contact disconnected.", { duration: 4000 });
      } else {
        toast("Call ended", { icon: "📞" });
      }
      cleanup();
    };

    const handleCancelled = ({ callId }) => {
      if (callId && currentCallIdRef.current && callId !== currentCallIdRef.current) {
        return;
      }
      toast("Caller cancelled", { icon: "📞" });
      cleanup();
    };

    const handleUnavailable = ({ callId }) => {
      if (callId && currentCallIdRef.current && callId !== currentCallIdRef.current) {
        return;
      }
      toast.error("Contact is not reachable right now.", { duration: 4000 });
      cleanup();
    };

    socket.on("call:incoming", handleIncoming);
    socket.on("call:answered", handleAnswered);
    socket.on("call:ice", handleIce);
    socket.on("call:rejected", handleRejected);
    socket.on("call:ended", handleEnded);
    socket.on("call:cancelled", handleCancelled);
    socket.on("call:unavailable", handleUnavailable);

    return () => {
      socket.off("call:incoming", handleIncoming);
      socket.off("call:answered", handleAnswered);
      socket.off("call:ice", handleIce);
      socket.off("call:rejected", handleRejected);
      socket.off("call:ended", handleEnded);
      socket.off("call:cancelled", handleCancelled);
      socket.off("call:unavailable", handleUnavailable);
    };
  }, [socket, cleanup, logCall]);

  const value = {
    callState,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};
