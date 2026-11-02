import React, { useContext, useEffect, useRef, useState } from "react";
import {
  IoCall,
  IoVideocam,
  IoVideocamOff,
  IoMic,
  IoMicOff,
} from "react-icons/io5";
import { MdCallEnd } from "react-icons/md";
import { CallContext } from "../context/CallContext";
import Avatar from "./Avatar";
import { formatDuration } from "../lib/utils";

const CallOverlay = () => {
  const {
    callState,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
  } = useContext(CallContext);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [seconds, setSeconds] = useState(0);

  const isVideo = callState.kind === "video";
  const peer = callState.peer || {};

  // Check if live remote video track exists and is active
  const hasRemoteVideo = Boolean(
    isVideo &&
      callState.remoteStream &&
      callState.remoteStream
        .getVideoTracks()
        .some((t) => t.readyState === "live" && t.enabled)
  );

  // Sync local video stream to picture-in-picture video element
  useEffect(() => {
    const video = localVideoRef.current;
    if (video) {
      if (callState.localStream && isVideo) {
        if (video.srcObject !== callState.localStream) {
          video.srcObject = callState.localStream;
        }
        video.play().catch(() => {});
      } else {
        video.srcObject = null;
      }
    }
  }, [callState.localStream, isVideo]);

  // Sync remote audio and video streams
  useEffect(() => {
    // 1. Audio stream synchronization (handles sound for both voice and video calls)
    const audioEl = remoteAudioRef.current;
    if (audioEl) {
      if (callState.remoteStream) {
        if (audioEl.srcObject !== callState.remoteStream) {
          audioEl.srcObject = callState.remoteStream;
        }
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn("Remote audio play request:", err);
          });
        }
      } else {
        audioEl.srcObject = null;
      }
    }

    // 2. Video stream synchronization
    const videoEl = remoteVideoRef.current;
    if (videoEl) {
      if (callState.remoteStream && isVideo) {
        if (videoEl.srcObject !== callState.remoteStream) {
          videoEl.srcObject = callState.remoteStream;
        }
        videoEl.onloadedmetadata = () => {
          videoEl.play().catch((err) => {
            console.warn("Remote video onloadedmetadata play error:", err);
          });
        };
        const playPromise = videoEl.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {});
        }
      } else {
        videoEl.srcObject = null;
      }
    }
  }, [callState.remoteStream, isVideo]);

  // Call duration timer
  useEffect(() => {
    if (callState.status !== "active" || !callState.startedAt) {
      setSeconds(0);
      return;
    }
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - callState.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [callState.status, callState.startedAt]);

  if (callState.status === "idle") return null;

  const handleAccept = () => {
    // Prime the audio element synchronously during user gesture to avoid browser autoplay policy blocks
    if (remoteAudioRef.current) {
      remoteAudioRef.current.play().catch(() => {});
    }
    acceptCall();
  };

  return (
    <>
      {/* 
        Persistent audio element for all call states.
        Kept at root to avoid unmounting during transitions and ensure uninterrupted audio playback.
      */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {callState.status === "incoming" ? (
        /* ---- INCOMING CALL OVERLAY ---- */
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 fade-up">
          <div className="bg-[#111b21] rounded-3xl p-8 max-w-sm w-full text-center border border-[#374045] shadow-2xl">
            <p className="text-[#8696a0] text-sm mb-1">
              Incoming {isVideo ? "video" : "voice"} call
            </p>
            <div className="relative inline-block my-6">
              <span className="absolute inset-0 rounded-full bg-[#00a884]/40 pulse-ring" />
              <span
                className="absolute inset-0 rounded-full bg-[#00a884]/30 pulse-ring"
                style={{ animationDelay: "0.3s" }}
              />
              <Avatar src={peer.profilePic} name={peer.fullName} size={120} />
            </div>
            <h2 className="text-2xl font-medium text-white">
              {peer.fullName || "Unknown"}
            </h2>
            <p className="text-[#8696a0] text-sm mt-1">QuickChat is calling...</p>

            <div className="flex items-center justify-center gap-12 mt-8">
              <button
                onClick={rejectCall}
                className="w-16 h-16 rounded-full bg-[#f15c6d] hover:bg-[#e94c5e] 
                flex items-center justify-center text-white shadow-lg transition active:scale-95"
                title="Decline"
              >
                <MdCallEnd className="text-3xl" />
              </button>
              <button
                onClick={handleAccept}
                className="w-16 h-16 rounded-full bg-[#00a884] hover:bg-[#06cf9c]
                flex items-center justify-center text-white shadow-lg transition active:scale-95"
                title="Accept"
              >
                {isVideo ? (
                  <IoVideocam className="text-3xl" />
                ) : (
                  <IoCall className="text-3xl" />
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ---- CALLING / ACTIVE CALL OVERLAY ---- */
        <div className="fixed inset-0 z-[100] bg-[#0b141a] flex flex-col fade-up select-none">
          {/* Top Bar */}
          <div
            className="px-6 py-4 flex items-center justify-between text-white
           bg-gradient-to-b from-black/70 to-transparent z-10"
          >
            <div className="flex items-center gap-3">
              <Avatar src={peer.profilePic} name={peer.fullName} size={42} />
              <div>
                <p className="font-medium text-base leading-tight">
                  {peer.fullName || "Calling..."}
                </p>
                <p className="text-xs text-[#aebac1] mt-0.5">
                  {callState.status === "active"
                    ? `${formatDuration(seconds)} · ${
                        isVideo ? "Video call" : "Voice call"
                      }`
                    : callState.status === "calling"
                    ? "Ringing…"
                    : "Connecting…"}
                </p>
                {(callState.connectionState || callState.iceState) &&
                  callState.status === "active" && (
                    <p className="text-[10px] text-[#8696a0] mt-0.5 capitalize">
                      {callState.iceState === "connected" ||
                      callState.iceState === "completed"
                        ? "Connected"
                        : callState.iceState
                        ? `Network: ${callState.iceState}`
                        : callState.connectionState
                        ? `Call: ${callState.connectionState}`
                        : ""}
                    </p>
                  )}
              </div>
            </div>
            <span className="text-xs text-[#aebac1] flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-[#00a884] animate-pulse" />
              End-to-end encrypted
            </span>
          </div>

          {/* Media Surface */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-[#0b141a]">
            {isVideo ? (
              <>
                {/* 
                  Remote video element: Always mounted to avoid remounting issues.
                  Muted so audio exclusively streams via persistent remoteAudioRef to eliminate echo.
                */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-opacity duration-300 ${
                    hasRemoteVideo ? "opacity-100" : "opacity-0 absolute inset-0 pointer-events-none"
                  }`}
                />

                {/* Remote Video Fallback Placeholder (when camera is off or connecting) */}
                {!hasRemoteVideo && (
                  <div className="flex flex-col items-center text-white z-0">
                    <div className="relative inline-block">
                      <span className="absolute inset-0 rounded-full bg-[#00a884]/30 pulse-ring" />
                      <Avatar
                        src={peer.profilePic}
                        name={peer.fullName}
                        size={160}
                      />
                    </div>
                    <p className="mt-6 text-xl font-medium">{peer.fullName || "User"}</p>
                    <p className="text-sm text-[#aebac1] mt-1">
                      {callState.status === "active"
                        ? "Camera is off"
                        : "Connecting video..."}
                    </p>
                  </div>
                )}

                {/* Local Video Preview (Picture-in-Picture) */}
                {callState.localStream && (
                  <div
                    className="absolute bottom-6 right-6 w-36 h-52 sm:w-44 sm:h-64 md:w-52 md:h-72 
                    rounded-2xl overflow-hidden border-2 border-[#00a884] shadow-2xl bg-[#111b21]
                    flex items-center justify-center z-20 transition-all"
                  >
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${
                        callState.cameraOff ? "hidden" : "block"
                      }`}
                      style={{ transform: "scaleX(-1)" }}
                    />
                    {callState.cameraOff && (
                      <div className="flex flex-col items-center justify-center p-4 text-center">
                        <IoVideocamOff className="text-3xl text-[#8696a0] mb-2" />
                        <p className="text-xs text-[#8696a0]">Camera Off</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Voice Call Surface */
              <div className="flex flex-col items-center text-white">
                <div className="relative inline-block">
                  <span className="absolute inset-0 rounded-full bg-[#00a884]/30 pulse-ring" />
                  <span
                    className="absolute inset-0 rounded-full bg-[#00a884]/20 pulse-ring"
                    style={{ animationDelay: "0.3s" }}
                  />
                  <Avatar src={peer.profilePic} name={peer.fullName} size={180} />
                </div>
                <h2 className="text-3xl font-light mt-6">
                  {peer.fullName || "Voice call"}
                </h2>
                <p className="text-[#aebac1] mt-2">
                  {callState.status === "active"
                    ? formatDuration(seconds)
                    : callState.status === "calling"
                    ? "Ringing…"
                    : "Connecting…"}
                </p>
                {callState.status === "active" &&
                  callState.iceState &&
                  callState.iceState !== "connected" &&
                  callState.iceState !== "completed" && (
                    <p className="text-xs text-[#8696a0] mt-1 capitalize">
                      {callState.iceState}
                    </p>
                  )}
              </div>
            )}
          </div>

          {/* Call Controls */}
          <div className="bg-gradient-to-t from-black/90 to-transparent py-8 px-6 flex items-center justify-center gap-6 z-10">
            {/* Mute Button */}
            <button
              onClick={toggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition shadow-lg active:scale-95 ${
                callState.muted
                  ? "bg-white text-black hover:bg-white/90"
                  : "bg-white/15 hover:bg-white/25"
              }`}
              title={callState.muted ? "Unmute microphone" : "Mute microphone"}
            >
              {callState.muted ? (
                <IoMicOff className="text-2xl" />
              ) : (
                <IoMic className="text-2xl" />
              )}
            </button>

            {/* Camera On / Off Button */}
            {isVideo && (
              <button
                onClick={toggleCamera}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition shadow-lg active:scale-95 ${
                  callState.cameraOff
                    ? "bg-white text-black hover:bg-white/90"
                    : "bg-white/15 hover:bg-white/25"
                }`}
                title={callState.cameraOff ? "Turn on camera" : "Turn off camera"}
              >
                {callState.cameraOff ? (
                  <IoVideocamOff className="text-2xl" />
                ) : (
                  <IoVideocam className="text-2xl" />
                )}
              </button>
            )}

            {/* End Call Button */}
            <button
              onClick={endCall}
              className="w-16 h-16 rounded-full bg-[#f15c6d] hover:bg-[#e94c5e] flex items-center justify-center text-white shadow-2xl transition active:scale-95"
              title="End call"
            >
              <MdCallEnd className="text-3xl" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default CallOverlay;
