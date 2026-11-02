import React, {
  useEffect,
  useRef,
  useState,
  useContext,
  useMemo,
} from "react";
import {
  IoArrowBack,
  IoVideocam,
  IoCall,
  IoSearchOutline,
  IoSend,
  IoHappyOutline,
  IoMicOutline,
  IoCloseCircle,
  IoCheckmarkOutline,
  IoCheckmarkDoneOutline,
  IoCopyOutline,
  IoPencil,
  IoArrowDown,
} from "react-icons/io5";
import { BsThreeDotsVertical, BsReply, BsTrash, BsStar, BsStarFill } from "react-icons/bs";
import { FaRegSmile, FaPaperclip, FaCamera } from "react-icons/fa";
import { MdOutlineImage, MdInsertDriveFile } from "react-icons/md";
import EmojiPicker, { Theme } from "emoji-picker-react";
import toast from "react-hot-toast";

import { ChatContext } from "../context/ChatContext";
import { AuthContext } from "../context/AuthContext";
import { CallContext } from "../context/CallContext";
import {
  formatMessageTime,
  formatChatDate,
  formatLastSeen,
  formatDuration,
  previewText,
  sid,
  idEq,
} from "../lib/utils";
import Avatar from "./Avatar";
import VoiceRecorder from "./VoiceRecorder";
import AudioBubble from "./AudioBubble";

const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🙏"];
const EDIT_WINDOW_MS = 15 * 60 * 1000;

const ChatContainer = () => {
  const {
    messages,
    selectedUser,
    selectedGroup,
    clearChatSelection,
    sendMessage,
    sendGroupMessage,
    getMessages,
    getGroupMessages,
    sendTyping,
    sendGroupTyping,
    typingUsers,
    groupTypingUsers,
    replyTo,
    setReplyTo,
    deleteMessage,
    reactToMessage,
    editMessageText,
  } = useContext(ChatContext);

  const { authUser, onlineUser, toggleStarMessage } = useContext(AuthContext);
  const { startCall, callState } = useContext(CallContext);

  const isGroup = !!selectedGroup;

  const displayNameForUserId = (uid) => {
    if (!uid) return "";
    if (idEq(uid, authUser?._id)) return "You";
    if (isGroup && selectedGroup?.members?.length) {
      const m = selectedGroup.members.find((x) =>
        idEq(x.user?._id || x.user, uid)
      );
      if (m?.user?.fullName) return m.user.fullName;
    }
    if (selectedUser && idEq(uid, selectedUser._id)) return selectedUser.fullName;
    return "Unknown";
  };

  const dispatchSend = async (payload) => {
    if (isGroup) await sendGroupMessage(payload);
    else await sendMessage(payload);
  };

  const messageIsStarred = (msgId) =>
    (authUser?.starredMessageIds || []).some((id) => sid(id) === sid(msgId));

  const canEditMessage = (msg) => {
    if (!idEq(msg.senderId, authUser?._id)) return false;
    if (msg.deletedForEveryone || msg.type !== "text") return false;
    return Date.now() - new Date(msg.createdAt).getTime() < EDIT_WINDOW_MS;
  };

  const messagesContainerRef = useRef(null);
  const scrollEnd = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const attachMenuRef = useRef(null);

  const isNearBottomRef = useRef(true);
  const prevChatKeyRef = useRef(null);
  const prevMessagesLengthRef = useRef(0);

  const [input, setInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [recording, setRecording] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [reactingFor, setReactingFor] = useState(null);
  const [menuFor] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const isOnline =
    selectedUser && onlineUser?.includes(sid(selectedUser?._id));

  const typingUid = selectedUser ? sid(selectedUser._id) : null;
  const isDmTyping = typingUid && typingUsers?.[typingUid];

  const groupTypingMap =
    selectedGroup && groupTypingUsers?.[sid(selectedGroup._id)];
  const isGroupTyping =
    groupTypingMap && Object.keys(groupTypingMap).length > 0;

  const isTyping = isGroup ? isGroupTyping : isDmTyping;

  const activeChatKey = selectedUser?._id
    ? `u:${sid(selectedUser._id)}`
    : selectedGroup?._id
    ? `g:${sid(selectedGroup._id)}`
    : null;

  const scrollToBottom = (behavior = "smooth") => {
    if (messagesContainerRef.current) {
      if (behavior === "smooth") {
        scrollEnd.current?.scrollIntoView({ behavior: "smooth" });
      } else {
        messagesContainerRef.current.scrollTop =
          messagesContainerRef.current.scrollHeight;
      }
    }
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const isNear = distanceFromBottom < 100;
    isNearBottomRef.current = isNear;
    setShowScrollBottom(!isNear);
  };

  const handleMediaLoad = () => {
    if (isNearBottomRef.current && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  };

  // ---------------- LOAD MESSAGES ON SELECT ----------------
  useEffect(() => {
    if (selectedUser?._id) {
      getMessages(selectedUser._id);
      setReplyTo(null);
      setShowEmoji(false);
      setShowAttach(false);
      setRecording(false);
      setSearchOpen(false);
    } else if (selectedGroup?._id) {
      getGroupMessages(selectedGroup._id);
      setReplyTo(null);
      setShowEmoji(false);
      setShowAttach(false);
      setRecording(false);
      setSearchOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser?._id, selectedGroup?._id]);

  useEffect(() => {
    setEditingId(null);
    setEditDraft("");
  }, [selectedUser?._id, selectedGroup?._id]);

  // ---------------- SMART AUTO SCROLL ----------------
  useEffect(() => {
    if (!activeChatKey) return;

    // 1. Switched conversations -> instant jump to bottom
    if (prevChatKeyRef.current !== activeChatKey) {
      prevChatKeyRef.current = activeChatKey;
      prevMessagesLengthRef.current = messages.length;
      requestAnimationFrame(() => {
        scrollToBottom("auto");
      });
      return;
    }

    // 2. New message added
    if (messages.length > prevMessagesLengthRef.current) {
      const latestMsg = messages[messages.length - 1];
      const isMine = latestMsg && idEq(latestMsg.senderId, authUser?._id);

      if (isMine) {
        // Current user sent the message: always smoothly scroll to bottom
        scrollToBottom("smooth");
      } else if (isNearBottomRef.current) {
        // Recipient was already near bottom: scroll smoothly to new message
        scrollToBottom("smooth");
      } else {
        // Recipient is viewing older messages: keep their place, show scroll-to-bottom prompt
        setShowScrollBottom(true);
      }
    }

    prevMessagesLengthRef.current = messages.length;
  }, [messages, activeChatKey, authUser?._id]);

  // Scroll for typing indicators only when user is already near bottom
  useEffect(() => {
    if (isTyping && isNearBottomRef.current) {
      scrollEnd.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isTyping]);

  // ---------------- CLOSE EMOJI/ATTACH ON OUTSIDE CLICK ----------------
  useEffect(() => {
    const onDoc = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttach(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // ---------------- TYPING ----------------
  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (isGroup && selectedGroup?._id) {
      sendGroupTyping(selectedGroup._id, true);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendGroupTyping(selectedGroup._id, false);
      }, 1500);
      return;
    }
    if (!selectedUser?._id) return;
    sendTyping(selectedUser._id, true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(selectedUser._id, false);
    }, 1500);
  };

  // ---------------- SEND MESSAGE ----------------
  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;
    if (!selectedUser?._id && !selectedGroup?._id) return;
    try {
      await dispatchSend({ text: input.trim() });
      setInput("");
      setEditingId(null);
      setEditDraft("");
      if (isGroup && selectedGroup?._id)
        sendGroupTyping(selectedGroup._id, false);
      else if (selectedUser?._id) sendTyping(selectedUser._id, false);
      setShowEmoji(false);
      inputRef.current?.focus();
    } catch {
      toast.error("Message failed");
    }
  };

  // ---------------- SEND IMAGE ----------------
  const handleSendImage = async (e) => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith("image/")) {
      toast.error("Select a valid image");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        await dispatchSend({ image: reader.result });
        e.target.value = "";
        setShowAttach(false);
      } catch {
        toast.error("Image send failed");
      }
    };
    reader.readAsDataURL(file);
  };

  // ---------------- SEND DOCUMENT ----------------
  const handleSendDoc = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File must be under 15MB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      await dispatchSend({
        file: {
          data: reader.result,
          name: file.name,
          size: file.size,
          mime: file.type,
        },
        type: "file",
      });
      e.target.value = "";
      setShowAttach(false);
    };
    reader.readAsDataURL(file);
  };

  // ---------------- VOICE NOTE ----------------
  const handleSendVoice = async ({ data }) => {
    try {
      await dispatchSend({ audio: data, type: "audio" });
      setRecording(false);
    } catch {
      toast.error("Voice send failed");
      setRecording(false);
    }
  };

  // ---------------- EMOJI ----------------
  const onEmojiClick = (emoji) => {
    setInput((p) => p + emoji.emoji);
    inputRef.current?.focus();
  };

  // ---------------- CALLS ----------------
  const handleAudioCall = () => {
    if (!selectedUser) return;
    if (callState.status !== "idle") {
      toast.error("Already in a call");
      return;
    }
    startCall(selectedUser, "audio");
  };
  const handleVideoCall = () => {
    if (!selectedUser) return;
    if (callState.status !== "idle") {
      toast.error("Already in a call");
      return;
    }
    startCall(selectedUser, "video");
  };

  // ---------------- GROUPED MESSAGES BY DAY ----------------
  const grouped = useMemo(() => {
    const out = [];
    let lastDay = null;
    const filtered = searchTerm
      ? messages.filter((m) =>
          (m.text || "").toLowerCase().includes(searchTerm.toLowerCase())
        )
      : messages;
    filtered.forEach((m) => {
      const day = m.createdAt
        ? new Date(m.createdAt).toDateString()
        : new Date().toDateString();
      if (day !== lastDay) {
        out.push({ type: "day", id: `day-${day}`, label: formatChatDate(m.createdAt) });
        lastDay = day;
      }
      out.push({ type: "msg", id: m._id, msg: m });
    });
    return out;
  }, [messages, searchTerm]);

  // ---------------- EMPTY ----------------
  if (!selectedUser && !selectedGroup) {
    return (
      <div className="hidden md:flex flex-col items-center justify-center bg-[#222e35] text-center px-8 border-l border-[#222d34] wa-chat-bg h-full min-h-0 overflow-hidden">
        <div className="max-w-md flex flex-col items-center gap-4">
          <div className="w-32 h-32 rounded-full bg-[#202c33] flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-20 h-20 text-[#00a884]" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 1.83.5 3.55 1.36 5.03L2 22l5.13-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm5.7 14.04c-.24.68-1.4 1.31-1.95 1.36-.5.05-1.13.07-1.82-.11-.42-.11-.96-.29-1.65-.59-2.91-1.26-4.81-4.19-4.96-4.39-.14-.2-1.18-1.57-1.18-2.99 0-1.42.74-2.12 1-2.41.26-.29.57-.36.76-.36.19 0 .38 0 .54.01.17.01.4-.07.62.47.24.58.81 2 .88 2.14.07.14.12.31.02.5-.1.19-.14.31-.29.48-.14.17-.31.38-.44.51-.14.14-.29.3-.13.59.17.29.74 1.22 1.59 1.98 1.09.97 2 1.27 2.29 1.42.29.14.46.12.63-.07.17-.19.72-.84.91-1.13.19-.29.39-.24.65-.14.26.1 1.66.78 1.94.93.29.14.48.21.55.33.07.12.07.66-.16 1.34z"/>
            </svg>
          </div>
          <h2 className="text-3xl font-light text-[#e9edef]">QuickChat Web</h2>
          <p className="text-sm text-[#8696a0] leading-relaxed">
            Send and receive messages, photos, videos, voice notes,
            and make audio &amp; video calls — all in one secure place.
          </p>
          <div className="mt-4 text-xs text-[#8696a0] flex items-center gap-2">
            <svg viewBox="0 0 10 12" className="w-3 h-3 fill-current">
              <path d="M5 0a3 3 0 0 0-3 3v2H1.5A1.5 1.5 0 0 0 0 6.5v4A1.5 1.5 0 0 0 1.5 12h7A1.5 1.5 0 0 0 10 10.5v-4A1.5 1.5 0 0 0 8.5 5H8V3a3 3 0 0 0-3-3zm0 1a2 2 0 0 1 2 2v2H3V3a2 2 0 0 1 2-2z" />
            </svg>
            End-to-end encrypted
          </div>
        </div>
      </div>
    );
  }

  // ---------------- MAIN UI ----------------
  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 w-full wa-chat-bg relative overflow-hidden">
      {/* HEADER */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#202c33] border-b border-[#222d34] z-10 shrink-0">
        <button
          onClick={() => clearChatSelection()}
          className="md:hidden text-[#aebac1] p-1"
        >
          <IoArrowBack className="text-xl" />
        </button>
        <Avatar
          src={isGroup ? selectedGroup.image : selectedUser.profilePic}
          name={isGroup ? selectedGroup.name : selectedUser.fullName}
          size={40}
          online={!isGroup && isOnline}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[#e9edef] font-medium truncate">
            {isGroup ? selectedGroup.name : selectedUser.fullName}
          </p>
          <p className="text-xs text-[#8696a0] truncate">
            {isGroup ? (
              isTyping ? (
                <span className="text-[#00a884]">typing...</span>
              ) : (
                `${selectedGroup.members?.length || 0} participants`
              )
            ) : isTyping ? (
              <span className="text-[#00a884]">typing...</span>
            ) : isOnline ? (
              "online"
            ) : selectedUser.lastSeen ? (
              `last seen ${formatLastSeen(selectedUser.lastSeen)}`
            ) : (
              "offline"
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 text-[#aebac1]">
          {!isGroup && (
            <>
              <button
                onClick={handleVideoCall}
                className="p-2 rounded-full hover:bg-[#374045] transition"
                title="Video call"
              >
                <IoVideocam className="text-xl" />
              </button>
              <button
                onClick={handleAudioCall}
                className="p-2 rounded-full hover:bg-[#374045] transition"
                title="Voice call"
              >
                <IoCall className="text-xl" />
              </button>
            </>
          )}
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className="p-2 rounded-full hover:bg-[#374045] transition"
            title="Search"
          >
            <IoSearchOutline className="text-xl" />
          </button>
          <button
            className="p-2 rounded-full hover:bg-[#374045] transition"
            title="Menu"
          >
            <BsThreeDotsVertical className="text-lg" />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="bg-[#202c33] border-b border-[#222d34] px-4 py-2 flex items-center gap-2 shrink-0 z-10">
          <IoSearchOutline className="text-[#8696a0]" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search messages..."
            className="flex-1 bg-transparent text-sm text-white placeholder-[#8696a0]"
          />
          <button
            onClick={() => {
              setSearchTerm("");
              setSearchOpen(false);
            }}
            className="text-[#8696a0] hover:text-white"
          >
            <IoCloseCircle />
          </button>
        </div>
      )}

      {/* MESSAGES */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-4 md:px-12 py-4 space-y-0.5"
      >
        {grouped.map((item) => {
          if (item.type === "day") {
            return (
              <div
                key={item.id}
                className="flex justify-center my-3 sticky top-0 z-[1]"
              >
                <span className="bg-[#1d282f] text-[#aebac1] text-xs px-3 py-1 rounded-md shadow">
                  {item.label}
                </span>
              </div>
            );
          }
          const msg = item.msg;
          const isMe = idEq(msg.senderId, authUser?._id);

          // CALL LOG
          if (msg.type === "call") {
            const k = msg.callInfo?.kind === "video" ? "Video" : "Voice";
            return (
              <div
                key={msg._id}
                className={`flex ${isMe ? "justify-end" : "justify-start"} my-1`}
              >
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#202c33] text-[#aebac1] text-sm border border-[#2a3942]">
                  {msg.callInfo?.kind === "video" ? (
                    <IoVideocam />
                  ) : (
                    <IoCall />
                  )}
                  <span>
                    {k} call ·{" "}
                    {msg.callInfo?.status === "missed"
                      ? "Missed"
                      : msg.callInfo?.status === "rejected"
                      ? "Declined"
                      : formatDuration(msg.callInfo?.duration || 0)}
                  </span>
                  <span className="text-xs text-[#8696a0] ml-2">
                    {formatMessageTime(msg.createdAt)}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={msg._id}
              className={`flex ${isMe ? "justify-end" : "justify-start"} my-0.5 group`}
              onMouseEnter={() => setHovered(msg._id)}
              onMouseLeave={() => {
                setHovered(null);
              }}
            >
              <div className="relative max-w-[85%] sm:max-w-[78%] flex items-start gap-2 min-w-0">
                <div
                  className={`relative px-2 pt-1.5 pb-1.5 rounded-lg shadow-sm fade-up ${
                    isMe
                      ? "bg-[#005c4b] text-white rounded-tr-none"
                      : "bg-[#202c33] text-[#e9edef] rounded-tl-none"
                  }`}
                  style={{ minWidth: 80 }}
                >
                  {isGroup && !isMe && (
                    <p className="text-[11px] font-medium text-[#00a884] px-1 mb-0.5">
                      {displayNameForUserId(msg.senderId)}
                    </p>
                  )}
                  {/* REPLY PREVIEW */}
                  {msg.replyTo && (msg.replyTo.text || msg.replyTo.image || msg.replyTo.audio) && (
                    <div
                      className={`mb-1 px-2 py-1.5 rounded border-l-4 ${
                        isMe
                          ? "bg-black/20 border-[#53bdeb]"
                          : "bg-black/30 border-[#00a884]"
                      }`}
                    >
                      <p className="text-[11px] font-semibold text-[#53bdeb]">
                        {displayNameForUserId(msg.replyTo.senderId)}
                      </p>
                      <p className="text-xs text-[#aebac1] truncate max-w-[260px]">
                        {previewText(msg.replyTo)}
                      </p>
                    </div>
                  )}

                  {/* DELETED */}
                  {msg.deletedForEveryone ? (
                    <p className="italic text-[#aebac1] text-sm flex items-center gap-1 px-1">
                      <BsTrash className="text-xs" /> This message was deleted
                    </p>
                  ) : (
                    <>
                      {/* IMAGE */}
                      {msg.image && (
                        <img
                          src={msg.image}
                          alt=""
                          onLoad={handleMediaLoad}
                          className="max-w-[300px] max-h-[400px] rounded mb-1 cursor-pointer object-cover"
                          onClick={() => window.open(msg.image, "_blank")}
                        />
                      )}

                      {/* AUDIO / VOICE */}
                      {msg.audio && (
                        <AudioBubble src={msg.audio} isMe={isMe} />
                      )}

                      {/* FILE */}
                      {msg.file?.url && (
                        <a
                          href={msg.file.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`flex items-center gap-3 px-2 py-2 rounded ${
                            isMe ? "bg-white/10" : "bg-black/20"
                          } min-w-[200px]`}
                        >
                          <MdInsertDriveFile className="text-3xl text-[#53bdeb]" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{msg.file.name}</p>
                            <p className="text-xs text-[#aebac1]">
                              {(msg.file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </a>
                      )}

                      {/* TEXT */}
                      {msg.text && (
                        <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-snug px-1">
                          {msg.text}
                        </p>
                      )}
                    </>
                  )}

                  {/* TIME + STATUS */}
                  <div
                    className={`flex items-center justify-end gap-1 text-[10px] mt-0.5 ${
                      isMe ? "text-[#aebac1]" : "text-[#8696a0]"
                    }`}
                  >
                    <span>{formatMessageTime(msg.createdAt)}</span>
                    {msg.editedAt && (
                      <span className="text-[9px] opacity-80 mx-0.5">edited</span>
                    )}
                    {isMe && !msg.deletedForEveryone && (
                      <span className="ml-0.5">
                        {msg.status === "read" ? (
                          <IoCheckmarkDoneOutline className="text-[#53bdeb] text-sm" />
                        ) : msg.status === "delivered" ? (
                          <IoCheckmarkDoneOutline className="text-sm" />
                        ) : (
                          <IoCheckmarkOutline className="text-sm" />
                        )}
                      </span>
                    )}
                  </div>

                  {/* REACTIONS */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div
                      className={`absolute -bottom-3 ${
                        isMe ? "right-2" : "left-2"
                      } flex gap-0.5 bg-[#202c33] border border-[#374045] rounded-full px-1.5 py-0.5 shadow`}
                    >
                      {[...new Set(msg.reactions.map((r) => r.emoji))].map(
                        (e) => (
                          <span key={e} className="text-[11px]">
                            {e}
                          </span>
                        )
                      )}
                      {msg.reactions.length > 1 && (
                        <span className="text-[10px] text-[#aebac1] ml-0.5">
                          {msg.reactions.length}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* HOVER ACTIONS */}
                {(hovered === msg._id || menuFor === msg._id || reactingFor === msg._id) &&
                  !msg.deletedForEveryone && (
                    <div
                      className={`flex flex-col gap-1 ${
                        isMe ? "order-first" : ""
                      } opacity-100`}
                    >
                      <button
                        onClick={() => toggleStarMessage(msg._id)}
                        className={`p-1.5 rounded-full bg-[#202c33] hover:bg-[#374045] shadow ${
                          messageIsStarred(msg._id)
                            ? "text-[#fcb100]"
                            : "text-[#aebac1]"
                        }`}
                        title={messageIsStarred(msg._id) ? "Unstar" : "Star"}
                      >
                        {messageIsStarred(msg._id) ? (
                          <BsStarFill />
                        ) : (
                          <BsStar />
                        )}
                      </button>
                      <button
                        onClick={() =>
                          setReactingFor(reactingFor === msg._id ? null : msg._id)
                        }
                        className="p-1.5 rounded-full bg-[#202c33] hover:bg-[#374045] text-[#aebac1] shadow"
                        title="React"
                      >
                        <FaRegSmile />
                      </button>
                      <button
                        onClick={() => {
                          setReplyTo(msg);
                          inputRef.current?.focus();
                        }}
                        className="p-1.5 rounded-full bg-[#202c33] hover:bg-[#374045] text-[#aebac1] shadow"
                        title="Reply"
                      >
                        <BsReply />
                      </button>
                      {msg.text && !msg.deletedForEveryone && (
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(msg.text);
                              toast.success("Message copied");
                            } catch {
                              toast.error("Could not copy");
                            }
                          }}
                          className="p-1.5 rounded-full bg-[#202c33] hover:bg-[#374045] text-[#aebac1] shadow"
                          title="Copy"
                        >
                          <IoCopyOutline />
                        </button>
                      )}
                      {canEditMessage(msg) && (
                        <button
                          onClick={() => {
                            setEditingId(msg._id);
                            setEditDraft(msg.text || "");
                            inputRef.current?.blur();
                          }}
                          className="p-1.5 rounded-full bg-[#202c33] hover:bg-[#374045] text-[#aebac1] shadow"
                          title="Edit message"
                        >
                          <IoPencil />
                        </button>
                      )}
                      {isMe && (
                        <button
                          onClick={() => deleteMessage(msg._id, true)}
                          className="p-1.5 rounded-full bg-[#202c33] hover:bg-[#374045] text-[#f15c6d] shadow"
                          title="Delete for everyone"
                        >
                          <BsTrash />
                        </button>
                      )}
                    </div>
                  )}

                {reactingFor === msg._id && (
                  <div
                    className={`absolute -top-12 ${
                      isMe ? "right-0" : "left-0"
                    } flex gap-1 bg-[#233138] border border-[#374045] rounded-full px-2 py-1 shadow-xl fade-up z-20`}
                  >
                    {QUICK_REACTIONS.map((e) => (
                      <button
                        key={e}
                        onClick={() => {
                          reactToMessage(msg._id, e);
                          setReactingFor(null);
                        }}
                        className="text-lg hover:scale-125 transition"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex justify-start my-1">
            <div className="bg-[#202c33] px-4 py-2 rounded-lg flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-[#aebac1] rounded-full typing-dot" />
              <span className="w-1.5 h-1.5 bg-[#aebac1] rounded-full typing-dot" />
              <span className="w-1.5 h-1.5 bg-[#aebac1] rounded-full typing-dot" />
            </div>
          </div>
        )}

        <div ref={scrollEnd} />
      </div>

      {/* EDIT MESSAGE */}
      {editingId && (
        <div className="bg-[#1d282f] border-l-4 border-[#53bdeb] mx-3 mt-1 px-3 py-2 rounded flex flex-col gap-2 fade-up z-20 shrink-0">
          <p className="text-xs text-[#53bdeb] font-medium">Edit message</p>
          <input
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            className="w-full bg-[#2a3942] rounded-lg px-3 py-2 text-sm text-white border border-[#374045]"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setEditDraft("");
              }}
              className="px-3 py-1.5 text-xs rounded-lg text-[#aebac1] hover:bg-[#374045]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!editDraft.trim()) {
                  toast.error("Message can't be empty");
                  return;
                }
                await editMessageText(editingId, editDraft.trim());
                setEditingId(null);
                setEditDraft("");
              }}
              className="px-4 py-1.5 text-xs rounded-lg bg-[#00a884] text-[#111b21] font-medium hover:bg-[#06cf9c]"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* REPLY BAR */}
      {replyTo && (
        <div className="bg-[#1d282f] border-l-4 border-[#00a884] mx-3 mt-1 px-3 py-2 rounded flex items-center gap-3 fade-up shrink-0 z-20">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[#00a884] font-semibold">
              Replying to{" "}
              {idEq(replyTo.senderId, authUser?._id)
                ? "yourself"
                : displayNameForUserId(replyTo.senderId)}
            </p>
            <p className="text-sm text-[#aebac1] truncate">
              {previewText(replyTo)}
            </p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="text-[#8696a0] hover:text-white"
          >
            <IoCloseCircle className="text-xl" />
          </button>
        </div>
      )}

      {/* SCROLL TO BOTTOM BUTTON */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className="absolute bottom-20 right-6 z-30 w-10 h-10 rounded-full bg-[#202c33] text-[#aebac1] hover:text-white border border-[#374045] shadow-2xl flex items-center justify-center hover:bg-[#2a3942] transition fade-up cursor-pointer"
          title="Scroll to bottom"
        >
          <IoArrowDown className="text-xl" />
        </button>
      )}

      {/* EMOJI PICKER */}
      {showEmoji && (
        <div className="absolute bottom-20 left-3 z-30">
          <EmojiPicker
            theme={Theme.DARK}
            onEmojiClick={onEmojiClick}
            height={350}
            width={320}
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}

      {/* INPUT */}
      <div className="bg-[#202c33] px-3 py-2 flex items-end gap-2 shrink-0 z-10">
        {recording ? (
          <VoiceRecorder
            onSend={handleSendVoice}
            onCancel={() => setRecording(false)}
          />
        ) : (
          <>
            <button
              onClick={() => {
                setShowEmoji((v) => !v);
                setShowAttach(false);
              }}
              className={`p-2 ${
                showEmoji ? "text-[#00a884]" : "text-[#8696a0]"
              } hover:text-white transition`}
              title="Emoji"
            >
              <IoHappyOutline className="text-2xl" />
            </button>

            {/* ATTACH MENU */}
            <div className="relative" ref={attachMenuRef}>
              <button
                onClick={() => {
                  setShowAttach((v) => !v);
                  setShowEmoji(false);
                }}
                className="p-2 text-[#8696a0] hover:text-white transition rotate-45"
                title="Attach"
              >
                <FaPaperclip className="text-xl" />
              </button>
              {showAttach && (
                <div className="absolute bottom-12 left-0 bg-[#233138] rounded-2xl p-2 flex flex-col gap-1 shadow-2xl border border-[#374045] fade-up min-w-[180px] z-20">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-[#182229] rounded-lg text-sm"
                  >
                    <span className="w-9 h-9 rounded-full bg-[#bf59cf] flex items-center justify-center text-white">
                      <MdOutlineImage />
                    </span>
                    Photo
                  </button>
                  <button
                    onClick={() => docInputRef.current?.click()}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-[#182229] rounded-lg text-sm"
                  >
                    <span className="w-9 h-9 rounded-full bg-[#5f66cd] flex items-center justify-center text-white">
                      <MdInsertDriveFile />
                    </span>
                    Document
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-[#182229] rounded-lg text-sm"
                  >
                    <span className="w-9 h-9 rounded-full bg-[#d3396d] flex items-center justify-center text-white">
                      <FaCamera />
                    </span>
                    Camera
                  </button>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleSendImage}
              hidden
            />
            <input
              ref={docInputRef}
              type="file"
              onChange={handleSendDoc}
              hidden
            />

            <div className="flex-1 bg-[#2a3942] rounded-full px-4 py-2.5 flex items-center">
              <input
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                type="text"
                placeholder="Type a message"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                className="flex-1 bg-transparent text-sm text-white placeholder-[#8696a0]"
              />
            </div>

            {input.trim() ? (
              <button
                onClick={handleSend}
                className="p-2.5 bg-[#00a884] rounded-full text-white hover:bg-[#06cf9c] transition"
                title="Send"
              >
                <IoSend className="text-lg" />
              </button>
            ) : (
              <button
                onClick={() => setRecording(true)}
                className="p-2.5 text-[#8696a0] hover:text-white transition"
                title="Record voice"
              >
                <IoMicOutline className="text-2xl" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ChatContainer;
