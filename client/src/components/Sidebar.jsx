import React, { useState, useContext, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BsChatLeftDotsFill,
  BsThreeDotsVertical,
  BsCheck2,
  BsCheck2All,
  BsPinAngle,
  BsPinAngleFill,
  BsBellSlash,
} from "react-icons/bs";
import {
  IoSearchOutline,
  IoSettingsOutline,
  IoArchiveOutline,
} from "react-icons/io5";
import { MdGroups, MdOutlineLogout } from "react-icons/md";
import { FaCircleNotch } from "react-icons/fa6";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import Avatar from "./Avatar";
import DemoGuideBanner from "./DemoGuideBanner";
import NewGroupModal from "./NewGroupModal";
import { formatChatListTime, previewText, sid, idEq } from "../lib/utils";

const Sidebar = () => {
  const {
    getUsers,
    users,
    groups,
    selectedUser,
    selectedGroup,
    openDM,
    openGroup,
    unseenMessages,
    unseenGroupMessages,
    lastMessages,
    lastGroupMessages,
    typingUsers,
    groupTypingUsers,
  } = useContext(ChatContext);

  const navigate = useNavigate();
  const {
    logout,
    onlineUser,
    authUser,
    togglePinChat,
    togglePinGroup,
  } = useContext(AuthContext);

  const mutedUsers = (authUser?.mutedUserIds || []).map(sid);
  const mutedGroups = (authUser?.mutedGroupIds || []).map(sid);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [tab, setTab] = useState("all");
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    getUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineUser]);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const dmRows = useMemo(() => {
    return [...users].map((u) => ({
      kind: "dm",
      id: `u:${sid(u._id)}`,
      user: u,
      sortTime:
        lastMessages?.[sid(u._id)]?.createdAt ||
        lastMessages?.[u._id]?.createdAt ||
        0,
    }));
  }, [users, lastMessages]);

  const groupRows = useMemo(() => {
    return [...(groups || [])].map((g) => ({
      kind: "group",
      id: `g:${sid(g._id)}`,
      group: g,
      sortTime:
        lastGroupMessages?.[sid(g._id)]?.createdAt ||
        lastGroupMessages?.[g._id]?.createdAt ||
        g.updatedAt ||
        0,
    }));
  }, [groups, lastGroupMessages]);

  const merged = useMemo(() => {
    let rows = [...dmRows, ...groupRows];

    const q = input.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        if (r.kind === "dm")
          return r.user.fullName?.toLowerCase().includes(q);
        return r.group.name?.toLowerCase().includes(q);
      });
    }

    if (tab === "unread") {
      rows = rows.filter((r) => {
        if (r.kind === "dm") {
          const uid = sid(r.user._id);
          return !!(unseenMessages?.[uid] ?? unseenMessages?.[r.user._id]);
        }
        const gid = sid(r.group._id);
        return !!(
          unseenGroupMessages?.[gid] ?? unseenGroupMessages?.[r.group._id]
        );
      });
    }

    if (tab === "favorites") {
      const chatPins = (authUser?.pinnedChatIds || []).map(sid);
      const groupPins = (authUser?.pinnedGroupIds || []).map(sid);
      rows = rows.filter((r) => {
        if (r.kind === "dm") return chatPins.includes(sid(r.user._id));
        return groupPins.includes(sid(r.group._id));
      });
    }

    return rows.sort((a, b) => new Date(b.sortTime) - new Date(a.sortTime));
  }, [
    dmRows,
    groupRows,
    input,
    tab,
    unseenMessages,
    unseenGroupMessages,
    authUser,
  ]);

  const pinOrderUsers = (authUser?.pinnedChatIds || []).map(sid);
  const pinOrderGroups = (authUser?.pinnedGroupIds || []).map(sid);

  const displayRows = useMemo(() => {
    return [...merged].sort((a, b) => {
      const pinIdx = (r) => {
        if (r.kind === "dm") {
          const i = pinOrderUsers.indexOf(sid(r.user._id));
          return i;
        }
        const j = pinOrderGroups.indexOf(sid(r.group._id));
        return j >= 0 ? j + 100 : -1;
      };
      const aIdx = pinIdx(a);
      const bIdx = pinIdx(b);
      const aPinned = aIdx >= 0;
      const bPinned = bIdx >= 0;
      if (aPinned && bPinned) return aIdx - bIdx;
      if (aPinned) return -1;
      if (bPinned) return 1;
      return new Date(b.sortTime) - new Date(a.sortTime);
    });
  }, [merged, pinOrderUsers, pinOrderGroups]);

  const hasPins = pinOrderUsers.length > 0 || pinOrderGroups.length > 0;

  const firstUnpinnedIdx = displayRows.findIndex((r) => {
    if (r.kind === "dm")
      return pinOrderUsers.indexOf(sid(r.user._id)) === -1;
    return pinOrderGroups.indexOf(sid(r.group._id)) === -1;
  });

  return (
    <div
      className={`bg-[#111b21] h-full min-h-0 min-w-0 flex flex-col text-[#e9edef]
      border-r border-[#222d34] overflow-hidden
      ${selectedUser || selectedGroup ? "max-md:hidden" : ""}`}
    >
      <NewGroupModal open={newGroupOpen} onClose={() => setNewGroupOpen(false)} />

      <div className="flex items-center justify-between px-4 py-3 bg-[#202c33]">
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => navigate("/profile")}
          title="Edit profile"
        >
          <Avatar
            src={authUser?.profilePic}
            name={authUser?.fullName}
            size={40}
          />
        </div>
        <div className="flex items-center gap-2 text-[#aebac1]">
          <button
            className="p-2 rounded-full hover:bg-[#374045] transition"
            title="Status"
          >
            <FaCircleNotch className="text-lg" />
          </button>
          <button
            className="p-2 rounded-full hover:bg-[#374045] transition"
            title="New chat"
          >
            <BsChatLeftDotsFill className="text-lg" />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen(!open)}
              className="p-2 rounded-full hover:bg-[#374045] transition"
              title="Menu"
            >
              <BsThreeDotsVertical className="text-lg" />
            </button>
            {open && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-lg 
              bg-[#233138] shadow-2xl py-2 z-30 border border-[#374045] fade-up">
                <button
                  onClick={() => {
                    setOpen(false);
                    navigate("/profile");
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#182229] 
                  flex items-center gap-3"
                >
                  <IoSettingsOutline /> Profile / Settings
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    setNewGroupOpen(true);
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#182229] 
                  flex items-center gap-3"
                >
                  <MdGroups /> New group
                </button>
                <button
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#182229] 
                  flex items-center gap-3"
                >
                  <IoArchiveOutline /> Archived
                </button>
                <div className="my-1 border-t border-[#374045]" />
                <button
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#182229] 
                  flex items-center gap-3 text-[#f15c6d]"
                >
                  <MdOutlineLogout /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <DemoGuideBanner />

      <div className="px-3 py-2 bg-[#111b21]">
        <div className="bg-[#202c33] rounded-lg flex items-center gap-3 px-4 py-2">
          <IoSearchOutline className="text-[#8696a0]" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            type="text"
            placeholder="Search or start new chat"
            className="flex-1 bg-transparent text-sm placeholder-[#8696a0] text-white"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 bg-[#111b21] border-b border-[#222d34]">
        {["all", "unread", "favorites"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition capitalize ${
              tab === t
                ? "bg-[#00a884]/20 text-[#00a884]"
                : "bg-[#202c33] text-[#aebac1] hover:bg-[#2a3942]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {displayRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#8696a0] px-4 text-center">
            <IoSearchOutline className="text-5xl mb-2 opacity-40" />
            <p className="text-sm">
              {input ? "No chats found" : "No conversations yet"}
            </p>
          </div>
        ) : (
          displayRows.map((row, rowIdx) => {
            if (row.kind === "dm") {
              const user = row.user;
              const uid = sid(user._id);
              const isOnline = onlineUser?.includes(uid);
              const last = lastMessages?.[uid] ?? lastMessages?.[user._id];
              const isTyping = typingUsers?.[uid];
              const unseen =
                (unseenMessages?.[uid] ?? unseenMessages?.[user._id]) || 0;
              const isSelected =
                selectedUser && idEq(selectedUser._id, user._id);
              const isLastMine = last && idEq(last.senderId, authUser?._id);
            const isPinned = pinOrderUsers.includes(uid);
            const isMuted = mutedUsers.includes(uid);

            return (
                <React.Fragment key={row.id}>
                  {hasPins && firstUnpinnedIdx === rowIdx && rowIdx > 0 && (
                    <div className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[#8696a0] bg-[#0b141a]/80 border-y border-[#222d34]">
                      Chats
                    </div>
                  )}
                  <div
                    onClick={() => openDM(user)}
                    className={`group flex items-center gap-2 px-3 py-3 cursor-pointer transition border-b border-[#222d34]
                ${isSelected ? "bg-[#2a3942]" : "hover:bg-[#202c33]"}`}
                  >
                    <Avatar
                      src={user.profilePic}
                      name={user.fullName}
                      size={48}
                      online={isOnline}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                        {isPinned && (
                          <BsPinAngleFill
                            className="text-[#8696a0] text-sm shrink-0"
                            aria-hidden
                          />
                        )}
                        {isMuted && (
                          <BsBellSlash
                            className="text-[#8696a0] text-sm shrink-0"
                            title="Muted"
                          />
                        )}
                        <p className="text-[#e9edef] font-medium truncate">
                          {user.fullName}
                          </p>
                        </div>
                        {last && (
                          <span
                            className={`text-[11px] shrink-0 ${
                              unseen > 0 ? "text-[#00a884]" : "text-[#8696a0]"
                            }`}
                          >
                            {formatChatListTime(last.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5 gap-2">
                        <p className="text-sm text-[#8696a0] truncate flex items-center gap-1 min-w-0">
                          {isTyping ? (
                            <span className="text-[#00a884] italic">
                              typing...
                            </span>
                          ) : (
                            <>
                              {isLastMine && last && last.type !== "call" && (
                                <span className="flex-shrink-0">
                                  {last.status === "read" ? (
                                    <BsCheck2All className="text-[#53bdeb]" />
                                  ) : last.status === "delivered" ? (
                                    <BsCheck2All />
                                  ) : (
                                    <BsCheck2 />
                                  )}
                                </span>
                              )}
                              <span className="truncate">
                                {last
                                  ? previewText(last)
                                  : user.bio || "Hey there!"}
                              </span>
                            </>
                          )}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          {unseen > 0 && (
                            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#00a884] text-white text-[11px] font-bold flex items-center justify-center">
                              {unseen}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePinChat(user._id);
                            }}
                            title={isPinned ? "Unpin chat" : "Pin chat (max 3)"}
                            className={`p-2 rounded-full opacity-70 group-hover:opacity-100 transition hover:bg-[#374045] ${
                              isPinned ? "text-[#00a884]" : "text-[#8696a0]"
                            }`}
                          >
                            {isPinned ? (
                              <BsPinAngleFill className="text-base" />
                            ) : (
                              <BsPinAngle className="text-base" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            }

            const g = row.group;
            const gid = sid(g._id);
            const last = lastGroupMessages?.[gid] ?? lastGroupMessages?.[g._id];
            const unseen =
              (unseenGroupMessages?.[gid] ??
                unseenGroupMessages?.[g._id]) ||
              0;
            const isSelected =
              selectedGroup && idEq(selectedGroup._id, g._id);
            const typingMap = groupTypingUsers?.[gid] || {};
            const someoneTyping = Object.keys(typingMap).length > 0;
            const isLastMine = last && idEq(last.senderId, authUser?._id);
            const isPinned = pinOrderGroups.includes(gid);
            const isMuted = mutedGroups.includes(gid);

            return (
              <React.Fragment key={row.id}>
                {hasPins && firstUnpinnedIdx === rowIdx && rowIdx > 0 && (
                  <div className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[#8696a0] bg-[#0b141a]/80 border-y border-[#222d34]">
                    Chats
                  </div>
                )}
                <div
                  onClick={() => openGroup(g)}
                  className={`group flex items-center gap-2 px-3 py-3 cursor-pointer transition border-b border-[#222d34]
                ${isSelected ? "bg-[#2a3942]" : "hover:bg-[#202c33]"}`}
                >
                  <Avatar src={g.image} name={g.name} size={48} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isPinned && (
                          <BsPinAngleFill
                            className="text-[#8696a0] text-sm shrink-0"
                            aria-hidden
                          />
                        )}
                        <MdGroups className="text-[#8696a0] text-sm shrink-0" />
                        {isMuted && (
                          <BsBellSlash
                            className="text-[#8696a0] text-sm shrink-0"
                            title="Muted"
                          />
                        )}
                        <p className="text-[#e9edef] font-medium truncate">
                          {g.name}
                        </p>
                      </div>
                      {last && (
                        <span
                          className={`text-[11px] shrink-0 ${
                            unseen > 0 ? "text-[#00a884]" : "text-[#8696a0]"
                          }`}
                        >
                          {formatChatListTime(last.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5 gap-2">
                      <p className="text-sm text-[#8696a0] truncate flex items-center gap-1 min-w-0">
                        {someoneTyping ? (
                          <span className="text-[#00a884] italic">
                            typing...
                          </span>
                        ) : (
                          <>
                            {isLastMine && last && last.type !== "call" && (
                              <span className="flex-shrink-0">
                                <BsCheck2All className="text-[#53bdeb]" />
                              </span>
                            )}
                            <span className="truncate">
                              {last
                                ? previewText(last)
                                : `${g.members?.length || 0} members`}
                            </span>
                          </>
                        )}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        {unseen > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#00a884] text-white text-[11px] font-bold flex items-center justify-center">
                            {unseen}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinGroup(g._id);
                          }}
                          title={isPinned ? "Unpin group" : "Pin group (max 3)"}
                          className={`p-2 rounded-full opacity-70 group-hover:opacity-100 transition hover:bg-[#374045] ${
                            isPinned ? "text-[#00a884]" : "text-[#8696a0]"
                          }`}
                        >
                          {isPinned ? (
                            <BsPinAngleFill className="text-base" />
                          ) : (
                            <BsPinAngle className="text-base" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Sidebar;
