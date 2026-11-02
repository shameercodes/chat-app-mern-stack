import express from "express";
import cors from "cors";
import helmet from "helmet";
import "dotenv/config";
import http from "http";
import { connectDB } from "./lib/db.js";
import userRoutes from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutes.js";
import { Server } from "socket.io";
import User from "./models/User.js";
import Message from "./models/Message.js";
import { initSocketRegistry } from "./socketRegistry.js";
import groupRoutes from "./routes/groupRoutes.js";

const app = express();
const server = http.createServer(app);

const corsList = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// initialize Socket.io server
export const io = new Server(server, {
  cors: {
    origin: corsList.length ? corsList : "*",
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e8, // 100 MB for voice/file
});

// store online users
export const userSocketMap = {}; // {userId : socketId}
export const userCallMap = {}; // {userId : peerId}

initSocketRegistry(io, userSocketMap);

const updateLastSeen = async (userId) => {
  if (!userId) return;
  try {
    await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
  } catch (err) {
    console.log("lastSeen update error:", err.message);
  }
};

const normId = (id) => (id == null ? "" : String(id));

io.on("connection", (socket) => {
  const userId = normId(socket.handshake.query.userId);
  console.log("User connected", userId);

  if (userId) {
    userSocketMap[userId] = socket.id;
    socket.userId = userId;
  }

  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // ---------- TYPING INDICATORS ----------
  socket.on("typing", ({ to }) => {
    const targetSocketId = userSocketMap[normId(to)];
    if (targetSocketId) {
      io.to(targetSocketId).emit("typing", { from: userId });
    }
  });

  socket.on("stopTyping", ({ to }) => {
    const targetSocketId = userSocketMap[normId(to)];
    if (targetSocketId) {
      io.to(targetSocketId).emit("stopTyping", { from: userId });
    }
  });

  socket.on("typingGroup", ({ groupId }) => {
    if (!groupId) return;
    socket.to(`group:${normId(groupId)}`).emit("typingGroup", {
      from: userId,
      groupId: normId(groupId),
    });
  });

  socket.on("stopTypingGroup", ({ groupId }) => {
    if (!groupId) return;
    socket.to(`group:${normId(groupId)}`).emit("stopTypingGroup", {
      from: userId,
      groupId: normId(groupId),
    });
  });

  socket.on("joinGroupRoom", ({ groupId }) => {
    if (groupId) socket.join(`group:${normId(groupId)}`);
  });

  socket.on("leaveGroupRoom", ({ groupId }) => {
    if (groupId) socket.leave(`group:${normId(groupId)}`);
  });

  // ---------- MESSAGE DELIVERED / READ ----------
  socket.on("messageDelivered", async ({ messageId, senderId }) => {
    try {
      await Message.findByIdAndUpdate(messageId, { status: "delivered" });
      const senderSocketId = userSocketMap[normId(senderId)];
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageStatus", {
          messageId,
          status: "delivered",
        });
      }
    } catch (err) {
      console.log("delivered err:", err.message);
    }
  });

  socket.on("messagesRead", async ({ from }) => {
    try {
      const fromId = normId(from);
      await Message.updateMany(
        { senderId: fromId, receiverId: userId, groupId: null, status: { $ne: "read" } },
        { $set: { status: "read", seen: true } }
      );
      const senderSocketId = userSocketMap[fromId];
      if (senderSocketId) {
        io.to(senderSocketId).emit("messagesRead", { by: userId });
      }
    } catch (err) {
      console.log("read err:", err.message);
    }
  });

  // ---------- WEBRTC CALL SIGNALING ----------
  socket.on("call:invite", ({ to, kind, offer, caller, callId }) => {
    if (!userId) return;
    const targetUserId = normId(to);
    if (!targetUserId || targetUserId === userId) return;

    const targetSocketId = userSocketMap[targetUserId];
    if (!targetSocketId) {
      socket.emit("call:unavailable", { to: targetUserId, callId });
      return;
    }

    // Callee is already in a call
    if (userCallMap[targetUserId]) {
      socket.emit("call:rejected", {
        from: targetUserId,
        reason: "busy",
        callId,
      });
      return;
    }

    // Register active call pair
    userCallMap[userId] = targetUserId;
    userCallMap[targetUserId] = userId;

    io.to(targetSocketId).emit("call:incoming", {
      from: userId,
      kind,
      offer,
      caller,
      callId,
    });
  });

  socket.on("call:answer", ({ to, answer, callId }) => {
    if (!userId) return;
    const targetSocketId = userSocketMap[normId(to)];
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:answered", { from: userId, answer, callId });
    }
  });

  socket.on("call:ice", ({ to, candidate, callId }) => {
    if (!userId) return;
    const targetSocketId = userSocketMap[normId(to)];
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:ice", { from: userId, candidate, callId });
    }
  });

  socket.on("call:reject", ({ to, reason, callId }) => {
    if (!userId) return;
    const targetUserId = normId(to);
    delete userCallMap[userId];
    delete userCallMap[targetUserId];

    const targetSocketId = userSocketMap[targetUserId];
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:rejected", {
        from: userId,
        reason: reason || "declined",
        callId,
      });
    }
  });

  socket.on("call:end", ({ to, callId }) => {
    if (!userId) return;
    const targetUserId = normId(to);
    delete userCallMap[userId];
    delete userCallMap[targetUserId];

    const targetSocketId = userSocketMap[targetUserId];
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:ended", { from: userId, callId });
    }
  });

  socket.on("call:cancel", ({ to, callId }) => {
    if (!userId) return;
    const targetUserId = normId(to);
    delete userCallMap[userId];
    delete userCallMap[targetUserId];

    const targetSocketId = userSocketMap[targetUserId];
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:cancelled", { from: userId, callId });
    }
  });

  // ---------- REACTIONS / DELETE BROADCAST ----------
  socket.on("messageReact", ({ to, messageId, emoji, by }) => {
    const targetSocketId = userSocketMap[normId(to)];
    if (targetSocketId) {
      io.to(targetSocketId).emit("messageReact", { messageId, emoji, by });
    }
  });

  // ---------- DISCONNECT ----------
  socket.on("disconnect", async () => {
    console.log("User Disconnected", userId);
    if (userId && userSocketMap[normId(userId)] === socket.id) {
      // If user was in an active call or dialing, notify the other peer immediately
      const activePeerId = userCallMap[userId];
      if (activePeerId) {
        delete userCallMap[userId];
        delete userCallMap[activePeerId];
        const peerSocketId = userSocketMap[activePeerId];
        if (peerSocketId) {
          io.to(peerSocketId).emit("call:ended", {
            from: userId,
            reason: "disconnected",
          });
        }
      }

      delete userSocketMap[normId(userId)];
      io.emit("getOnlineUsers", Object.keys(userSocketMap));
      await updateLastSeen(userId);
      io.emit("userLastSeen", { userId, lastSeen: new Date() });
    }
  });
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(
  cors({
    origin: corsList.length ? corsList : true,
    credentials: true,
  })
);
app.use(express.json({ limit: "20mb" }));
app.use("/api/status", (req, res) => res.send("server is live"));
app.use("/api/auth", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/messages", messageRouter);

await connectDB();

const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
