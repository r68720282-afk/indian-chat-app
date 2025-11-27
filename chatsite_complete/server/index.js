const mongoose = require("mongoose");
const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io");

// MODELS
const Message = require("./models/message.model");
const DM = require("./models/dm.model");

// MAP for online users
// username → socketId
const onlineUsers = new Map();

// ROOM DATA
const rooms = {
  general: { id: "general", users: new Map() },
  tech: { id: "tech", users: new Map() },
  fun: { id: "fun", users: new Map() },
  love: { id: "love", users: new Map() },
  gaming: { id: "gaming", users: new Map() }
};

/* -------------------------------------------
   MONGO CONNECT
------------------------------------------- */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("Mongo Error:", err));

/* -------------------------------------------
   APP + SERVER + SOCKET
------------------------------------------- */
const app = express();
app.use(cors());
app.use(express.json());

// static public folder
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api", (req, res) => {
  res.json({ status: "Chat server running", time: Date.now() });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* -------------------------------------------
   SOCKET CONNECTION
------------------------------------------- */
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  /* ----------------------------
      REGISTER USER (DM SUPPORT)
  ---------------------------- */
  socket.on("registerUser", (username) => {
    if (!username) return;
    socket.data.username = username;
    onlineUsers.set(username, socket.id);
    console.log("Registered for DM:", username);
  });

  /* ----------------------------
      JOIN ROOM
  ---------------------------- */
  socket.on("joinRoom", async ({ roomId, username }) => {
    if (!roomId) roomId = "general";

    socket.join(roomId);
    socket.data.username = username;
    socket.data.roomId = roomId;

    if (!rooms[roomId]) {
      rooms[roomId] = { id: roomId, users: new Map() };
    }

    rooms[roomId].users.set(socket.id, {
      id: socket.id,
      name: username
    });

    // Load recent messages
    const recent = await Message.find({ roomId })
      .sort({ ts: 1 })
      .limit(100)
      .lean();

    socket.emit("recentMessages", recent);

    io.to(roomId).emit("systemMessage", { text: `${username} joined` });

    io.to(roomId).emit("roomUsers", {
      count: rooms[roomId].users.size,
      list: Array.from(rooms[roomId].users.values())
    });
  });

  /* ----------------------------
      SEND ROOM MESSAGE
  ---------------------------- */
  socket.on("sendMessage", async ({ roomId, text }) => {
    roomId = roomId || socket.data.roomId;

    const msg = {
      roomId,
      user: socket.data.username,
      text,
      ts: Date.now()
    };

    try {
      const saved = await Message.create(msg);
      io.to(roomId).emit("message", saved);
    } catch {
      io.to(roomId).emit("message", msg); // fallback
    }
  });

  /* ----------------------------
      OPEN DIRECT MESSAGE WINDOW
  ---------------------------- */
  socket.on("dm:open", async ({ from, to }) => {
    const history = await DM.find({
      $or: [
        { from, to },
        { from: to, to: from }
      ]
    })
      .sort({ ts: 1 })
      .limit(200)
      .lean();

    socket.emit("dm:history", history);
  });

  /* ----------------------------
      SEND DIRECT MESSAGE
  ---------------------------- */
  socket.on("dm:send", async ({ from, to, text }) => {
    const msg = {
      from,
      to,
      text,
      ts: Date.now()
    };

    const saved = await DM.create(msg);

    // Send to sender
    socket.emit("dm:sent", saved);

    // Send to receiver (if online)
    const receiverId = onlineUsers.get(to);
    if (receiverId) {
      io.to(receiverId).emit("dm:receive", saved);
    }
  });

  /* ----------------------------
      DISCONNECT
  ---------------------------- */
  socket.on("disconnect", () => {
    const username = socket.data.username;
    const roomId = socket.data.roomId;

    if (username) onlineUsers.delete(username);

    if (roomId && rooms[roomId]) {
      rooms[roomId].users.delete(socket.id);

      io.to(roomId).emit("roomUsers", {
        count: rooms[roomId].users.size,
        list: Array.from(rooms[roomId].users.values())
      });
    }

    console.log("User disconnected:", socket.id);
  });
});

/* -------------------------------------------
   START SERVER
------------------------------------------- */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
