import React, { useContext, useMemo, useState, useCallback } from "react";
import {
  IoCloseOutline,
  IoStarOutline,
  IoLockClosedOutline,
} from "react-icons/io5";
import { BsBellSlash, BsExclamationOctagon } from "react-icons/bs";
import { MdBlock, MdOutlineImage, MdGroups, MdPersonAdd } from "react-icons/md";

import { ChatContext } from "../context/ChatContext";
import { AuthContext } from "../context/AuthContext";
import Avatar from "./Avatar";
import { formatLastSeen, sid, idEq, previewText, formatMessageTime } from "../lib/utils";

const RightSidebar = () => {
  const {
    selectedUser,
    selectedGroup,
    messages,
    users,
    addGroupMembers,
    leaveGroup,
  } = useContext(ChatContext);
  const { onlineUser, authUser, axios, toggleMuteChat, toggleMuteGroup } =
    useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [starredOpen, setStarredOpen] = useState(false);
  const [starredMessages, setStarredMessages] = useState([]);


  const loadStarred = useCallback(async () => {
    try {
      const { data } = await axios.get("/api/messages/starred");
      if (data.success) setStarredMessages(data.messages || []);
    } catch {
      setStarredMessages([]);
    }
  }, [axios]);

  const toggleStarredPanel = useCallback(async () => {
    const next = !starredOpen;
    setStarredOpen(next);
    if (next) await loadStarred();
  }, [starredOpen, loadStarred]);

  const isOnline = selectedUser && onlineUser?.includes(sid(selectedUser?._id));

  const media = useMemo(
    () => messages.filter((m) => m.image).map((m) => m.image),
    [messages]
  );
  const audios = useMemo(
    () => messages.filter((m) => m.audio),
    [messages]
  );

  const isGroup = !!selectedGroup;

  const myMember = selectedGroup?.members?.find((m) =>
    idEq(m.user?._id || m.user, authUser?._id)
  );
  const isAdmin = myMember?.role === "admin";

  const addableUsers = useMemo(() => {
    if (!addOpen || !selectedGroup?.members) return [];
    const inGroup = new Set(
      selectedGroup.members.map((m) => sid(m.user?._id || m.user))
    );
    let list = users.filter((u) => !inGroup.has(sid(u._id)));
    const q = addQuery.trim().toLowerCase();
    if (q) list = list.filter((u) => u.fullName?.toLowerCase().includes(q));
    return list;
  }, [addOpen, selectedGroup, users, addQuery]);

  if (!selectedUser && !selectedGroup) return null;

  if (isGroup) {
    const g = selectedGroup;
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="flex xl:hidden absolute right-4 top-3 z-10 px-3 py-1.5 rounded-full
          bg-[#202c33] hover:bg-[#2a3942] text-xs text-[#aebac1] border border-[#374045] shadow-md"
        >
          Group info
        </button>

        {open && (
          <div
            className="fixed inset-0 bg-black/50 z-40 xl:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        <div
          className={`bg-[#111b21] border-l border-[#222d34] text-[#e9edef]
          h-full min-h-0 overflow-y-auto transition-all duration-300
          ${
            open
              ? "fixed inset-y-0 right-0 z-50 w-full sm:w-[360px] max-w-full shadow-2xl xl:static xl:w-auto xl:shadow-none"
              : "hidden xl:block"
          }`}
        >
          <div className="bg-[#202c33] flex items-center gap-4 px-4 py-3.5 border-b border-[#222d34]">
            <button
              onClick={() => setOpen(false)}
              className="text-[#aebac1] hover:text-white p-1 xl:hidden"
            >
              <IoCloseOutline className="text-xl" />
            </button>
            <h2 className="font-medium flex items-center gap-2">
              <MdGroups /> Group info
            </h2>
          </div>

          <div className="flex flex-col items-center bg-[#111b21] py-8 px-4 border-b-8 
          border-[#0b141a]">
            <Avatar src={g.image} name={g.name} size={140} />
            <h3 className="mt-4 text-xl font-medium text-white">{g.name}</h3>
            <p className="text-sm text-[#8696a0] mt-1">
              {g.members?.length || 0} members
              {isAdmin ? " · You're an admin" : ""}
            </p>
            {g.description ? (
              <p className="text-xs text-[#8696a0] mt-2 text-center max-w-xs">
                {g.description}
              </p>
            ) : null}
          </div>

          <div className="bg-[#111b21] px-5 py-4 border-b-8 border-[#0b141a]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-[#aebac1]">Members</p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setAddOpen((v) => !v)}
                  className="text-xs text-[#00a884] flex items-center gap-1 hover:underline"
                >
                  <MdPersonAdd className="text-base" /> Add
                </button>
              )}
            </div>

            {addOpen && isAdmin && (
              <div className="mb-3 rounded-lg border border-[#222d34] bg-[#0b141a] p-2">
                <input
                  value={addQuery}
                  onChange={(e) => setAddQuery(e.target.value)}
                  placeholder="Search people…"
                  className="w-full rounded bg-[#202c33] border border-[#374045] px-2 
                  py-1.5 text-xs text-[#e9edef] mb-2"
                />
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {addableUsers.length === 0 ? (
                    <p className="text-[11px] text-[#8696a0] px-1">
                      No one to add
                    </p>
                  ) : (
                    addableUsers.map((u) => (
                      <button
                        key={sid(u._id)}
                        type="button"
                        onClick={async () => {
                          const res = await addGroupMembers(g._id, [u._id]);
                          if (res) {
                            setAddQuery("");
                            setAddOpen(false);
                          }
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded 
                        hover:bg-[#202c33] text-left"
                      >
                        <Avatar
                          src={u.profilePic}
                          name={u.fullName}
                          size={32}
                        />
                        <span className="text-sm truncate">{u.fullName}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {(g.members || []).map((m) => {
                const u = m.user;
                const uid = sid(u?._id || u);
                const on = onlineUser?.includes(uid);
                return (
                  <li
                    key={uid}
                    className="flex items-center gap-3 text-sm py-1"
                  >
                    <Avatar
                      src={u?.profilePic}
                      name={u?.fullName || "User"}
                      size={40}
                      online={on}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[#e9edef]">
                        {u?.fullName || "User"}
                        {idEq(u?._id, authUser?._id) ? " (you)" : ""}
                      </p>
                      <p className="text-[11px] text-[#8696a0]">
                        {m.role === "admin" ? "Admin" : "Member"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="bg-[#111b21] px-5 py-4 border-b-8 border-[#0b141a]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-[#aebac1] flex items-center gap-2">
                <MdOutlineImage /> Media
              </p>
              <span className="text-xs text-[#8696a0]">{media.length}</span>
            </div>
            {media.length === 0 ? (
              <p className="text-xs text-[#8696a0] italic">No media yet</p>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {media.slice(-9).map((url, i) => (
                  <div
                    key={i}
                    onClick={() => window.open(url, "_blank")}
                    className="aspect-square rounded overflow-hidden cursor-pointer hover:opacity-80 transition"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {audios.length > 0 && (
            <div className="bg-[#111b21] px-5 py-4 border-b-8 border-[#0b141a]">
              <p className="text-sm text-[#aebac1] mb-2">
                Voice notes ({audios.length})
              </p>
            </div>
          )}

          <div className="bg-[#111b21] divide-y divide-[#222d34] border-b-8
          border-[#0b141a]">
            <button
              type="button"
              onClick={() => void toggleStarredPanel()}
              className="w-full px-5 py-3 flex items-center gap-4 text-sm
               hover:bg-[#202c33]"
            >
              <IoStarOutline className="text-xl text-[#aebac1]" />
              Starred messages
            </button>
            {starredOpen && (
              <div className="px-5 py-3 max-h-56 overflow-y-auto bg-[#0b141a]">
                {starredMessages.length === 0 ? (
                  <p className="text-xs text-[#8696a0]">No starred messages yet</p>
                ) : (
                  starredMessages.map((m) => (
                    <div
                      key={m._id}
                      className="text-xs py-2 border-b border-[#222d34] last:border-0"
                    >
                      <p className="text-[#8696a0]">
                        {formatMessageTime(m.createdAt)}
                      </p>
                      <p className="text-[#e9edef] line-clamp-2">{previewText(m)}</p>
                    </div>
                  ))
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => toggleMuteGroup(g._id)}
              className="w-full px-5 py-3 flex items-center gap-4 text-sm hover:bg-[#202c33] text-left"
            >
              <BsBellSlash className="text-xl text-[#aebac1]" />
              {(authUser?.mutedGroupIds || []).some((id) => sid(id) === sid(g._id))
                ? "Unmute notifications"
                : "Mute notifications"}
            </button>
          </div>

          <div className="bg-[#111b21] px-5 py-4">
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Leave this group?")) leaveGroup(g._id);
              }}
              className="w-full py-3 rounded-lg text-[#f15c6d] text-sm hover:bg-[#202c33]"
            >
              Leave group
            </button>
          </div>
        </div>
      </>
    );
  }

  const u = selectedUser;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex xl:hidden absolute right-4 top-3 z-10 px-3 py-1.5 rounded-full
          bg-[#202c33] hover:bg-[#2a3942] text-xs text-[#aebac1] border border-[#374045] shadow-md"
      >
        Contact info
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 xl:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        className={`bg-[#111b21] border-l border-[#222d34] text-[#e9edef]
        h-full min-h-0 overflow-y-auto transition-all duration-300
        ${
          open
            ? "fixed inset-y-0 right-0 z-50 w-full sm:w-[360px] max-w-full shadow-2xl xl:static xl:w-auto xl:shadow-none"
            : "hidden xl:block"
        }`}
      >
        <div className="bg-[#202c33] flex items-center gap-4 px-4 py-3.5 border-b border-[#222d34]">
          <button
            onClick={() => setOpen(false)}
            className="text-[#aebac1] hover:text-white p-1 xl:hidden"
          >
            <IoCloseOutline className="text-xl" />
          </button>
          <h2 className="font-medium">Contact info</h2>
        </div>

        <div className="flex flex-col items-center bg-[#111b21] py-8 px-4 border-b-8 border-[#0b141a]">
          <Avatar
            src={u.profilePic}
            name={u.fullName}
            size={140}
            online={isOnline}
          />
          <h3 className="mt-4 text-xl font-medium text-white">{u.fullName}</h3>
          <p className="text-sm text-[#8696a0] mt-1">
            {isOnline
              ? "online"
              : u.lastSeen
              ? `last seen ${formatLastSeen(u.lastSeen)}`
              : "offline"}
          </p>
          <p className="text-xs text-[#8696a0] mt-0.5 truncate max-w-full px-2">
            {u.email}
          </p>
        </div>

        <div className="bg-[#111b21] px-5 py-4 border-b-8 border-[#0b141a]">
          <p className="text-xs text-[#8696a0] mb-1">About</p>
          <p className="text-[#e9edef]">
            {u.bio || "Hey there! I am using QuickChat."}
          </p>
        </div>

        <div className="bg-[#111b21] px-5 py-4 border-b-8 border-[#0b141a]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-[#aebac1] flex items-center gap-2">
              <MdOutlineImage /> Media, links and docs
            </p>
            <span className="text-xs text-[#8696a0]">{media.length}</span>
          </div>
          {media.length === 0 ? (
            <p className="text-xs text-[#8696a0] italic">No media yet</p>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {media.slice(-9).map((url, i) => (
                <div
                  key={i}
                  onClick={() => window.open(url, "_blank")}
                  className="aspect-square rounded overflow-hidden cursor-pointer hover:opacity-80 transition"
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {audios.length > 0 && (
          <div className="bg-[#111b21] px-5 py-4 border-b-8 border-[#0b141a]">
            <p className="text-sm text-[#aebac1] mb-2">
              Voice notes ({audios.length})
            </p>
          </div>
        )}

        <div className="bg-[#111b21] divide-y divide-[#222d34] border-b-8 border-[#0b141a]">
          <button
            type="button"
            onClick={() => void toggleStarredPanel()}
            className="w-full px-5 py-3 flex items-center gap-4 text-sm hover:bg-[#202c33]"
          >
            <IoStarOutline className="text-xl text-[#aebac1]" />
            Starred messages
          </button>
          {starredOpen && (
            <div className="px-5 py-3 max-h-56 overflow-y-auto bg-[#0b141a]">
              {starredMessages.length === 0 ? (
                <p className="text-xs text-[#8696a0]">No starred messages yet</p>
              ) : (
                starredMessages.map((m) => (
                  <div
                    key={m._id}
                    className="text-xs py-2 border-b border-[#222d34] last:border-0"
                  >
                    <p className="text-[#8696a0]">
                      {formatMessageTime(m.createdAt)}
                    </p>
                    <p className="text-[#e9edef] line-clamp-2">{previewText(m)}</p>
                  </div>
                ))
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => toggleMuteChat(u._id)}
            className="w-full px-5 py-3 flex items-center gap-4 text-sm hover:bg-[#202c33] text-left"
          >
            <BsBellSlash className="text-xl text-[#aebac1]" />
            {(authUser?.mutedUserIds || []).some((id) => sid(id) === sid(u._id))
              ? "Unmute notifications"
              : "Mute notifications"}
          </button>
          <button className="w-full px-5 py-3 flex items-center gap-4 text-sm hover:bg-[#202c33]">
            <IoLockClosedOutline className="text-xl text-[#aebac1]" />
            Encryption
            <span className="ml-auto text-xs text-[#8696a0]">
              End-to-end
            </span>
          </button>
        </div>

        <div className="bg-[#111b21] divide-y divide-[#222d34]">
          <button className="w-full px-5 py-3 flex items-center gap-4 text-sm text-[#f15c6d] hover:bg-[#202c33]">
            <MdBlock className="text-xl" /> Block {u.fullName}
          </button>
          <button className="w-full px-5 py-3 flex items-center gap-4 text-sm text-[#f15c6d] hover:bg-[#202c33]">
            <BsExclamationOctagon className="text-xl" /> Report contact
          </button>
        </div>
      </div>
    </>
  );
};

export default RightSidebar;
