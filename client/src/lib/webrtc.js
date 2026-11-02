// STUN + public TURN relay (Open Relay) — helps calls work through NAT / firewalls.
// For production, environment variables VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL can be provided.
const envTurnUrl = import.meta.env.VITE_TURN_URL;
const envTurnUser = import.meta.env.VITE_TURN_USERNAME;
const envTurnCred = import.meta.env.VITE_TURN_CREDENTIAL;

export const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    ...(envTurnUrl
      ? [
          {
            urls: envTurnUrl,
            username: envTurnUser || undefined,
            credential: envTurnCred || undefined,
          },
        ]
      : [
          {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: "turn:openrelay.metered.ca:443?transport=tcp",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
        ]),
  ],
  iceCandidatePoolSize: 10,
};

export const createPeerConnection = (handlers = {}) => {
  const pc = new RTCPeerConnection(RTC_CONFIG);

  pc.onicecandidate = (e) => {
    if (e.candidate && handlers.onIceCandidate) {
      handlers.onIceCandidate(e.candidate);
    }
  };

  pc.ontrack = (e) => {
    if (handlers.onTrack) {
      const stream =
        e.streams && e.streams[0]
          ? e.streams[0]
          : new MediaStream([e.track]);
      handlers.onTrack(stream, e.track);
    }
  };

  pc.onconnectionstatechange = () => {
    if (handlers.onConnectionStateChange) {
      handlers.onConnectionStateChange(pc.connectionState);
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (handlers.onIceConnectionStateChange) {
      handlers.onIceConnectionStateChange(pc.iceConnectionState);
    }
  };

  return pc;
};

export const getLocalStream = async ({ audio = true, video = false } = {}) => {
  const audioConstraints = audio
    ? {
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
        channelCount: { ideal: 1 },
      }
    : false;

  const videoConstraints = video
    ? {
        facingMode: { ideal: "user" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      }
    : false;

  // Tier 1: Request optimal constraints with HD video and audio processing
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: videoConstraints,
    });
  } catch (err1) {
    console.warn("Optimal getUserMedia constraints failed, trying basic constraints:", err1);

    // Tier 2: Fallback to basic unconstrained audio/video (resolves OverconstrainedError on low-res cams / mobile)
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: audio ? true : false,
        video: video ? true : false,
      });
    } catch (err2) {
      console.warn("Basic video+audio getUserMedia failed:", err2);

      // Tier 3: If video was requested but failed (e.g. camera in use, webcam disconnected, or camera permission blocked),
      // attempt audio-only capture so user is not completely shut out
      if (video && audio) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          audioStream._cameraUnavailable = true;
          audioStream._cameraError = err2;
          return audioStream;
        } catch (err3) {
          throw err2;
        }
      }
      throw err2;
    }
  }
};

export const stopStream = (stream) => {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
        t.enabled = false;
      } catch (e) {}
    });
  } catch (err) {
    console.error("Error stopping media track:", err);
  }
};
