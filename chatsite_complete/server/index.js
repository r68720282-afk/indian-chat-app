const mongoose = require("mongoose");
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
// DM system
const DM = require("./models/dm.model");

// store connected users
let onlineUsers = {}; 
// username → socket.id

// Models
const Message = require("./models/message.model");

// MongoDB Connect
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("Mongo Error:", err));

const app = express();
app.use(cors());
app.use(express.json());

// API Routes
const statusRoutes = require("./routes/status.routes");
const roomsRoutes = require("./routes/rooms.routes");

app.use("/api/status", statusRoutes);
app.use("/api/rooms", roomsRoutes);

// Public folder
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api', (req, res) => {
  res.json({ status: "Chat server running", time: Date.now() });
});

// Server + Socket
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Rooms storage (MAP for online users)
const rooms = {
  general: { id: "general", users: new Map() },
  tech: { id: "tech", users: new Map() },
  fun: { id: "fun", users: new Map() },
  love: { id: "love", users: new Map() },
  gaming: { id: "gaming", users: new Map() }
};

// Store all connected sockets by username
const onlineUsers = new Map();

/*
onlineUsers = {
  "Rohit" : socket.id,
  "Guest123" : socket.id
}
*/


io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
// USER REGISTRATION FOR DM
socket.on("registerUser", (username) => {
  if (!username) return;
  onlineUsers[username] = socket.id;
  console.log("DM Registered:", username);
});

// OPEN DM: SEND HISTORY
socket.on("dm:open", async ({ from, to }) => {
  if (!from || !to) return;

  try {
    const history = await DM.find({
      $or: [
        { from, to },
        { from: to, to: from }
      ]
    }).sort({ ts: 1 }).limit(200);

    socket.emit("dm:history", history);
  } catch (err) {
    console.log("DM history error:", err);
  }
});

// SEND DM MESSAGE
socket.on("dm:send", async (msg) => {
  try {
    const saved = await DM.create(msg);

    const receiverSocket = onlineUsers[msg.to];

    if (receiverSocket) {
      io.to(receiverSocket).emit("dm:receive", saved);
    }

    socket.emit("dm:sent", saved);

  } catch (err) {
    console.log("DM send error:", err);
  }
});

// DISCONNECT CLEANUP
socket.on("disconnect", () => {
  for (const u in onlineUsers) {
    if (onlineUsers[u] === socket.id) {
      delete onlineUsers[u];
      break;
    }
  }
});

  /* ------------------- ROOM EVENTS (already added) ------------------- */
  socket.on("joinRoom", ... );
  socket.on("sendMessage", ... );

  /* ------------------- DM EVENTS BELOW ------------------- */
  socket.on("dm:open", async ({ from, to }) => {
    const msgs = await DMMessage.find({
      $or: [
        { from, to },
        { from: to, to: from }
      ]
    }).sort({ ts: 1 });

    socket.emit("dm:history", msgs);
  });

  socket.on("dm:send", async (data) => {
    const saved = await DMMessage.create(data);

    io.to(data.to).emit("dm:receive", saved);
    socket.emit("dm:sent", saved);
  });

});

  // ==========================
  // REGISTER DM USER
  // ==========================
  socket.on("registerUser", (username) => {
    socket.data.username = username;
    onlineUsers.set(username, socket.id);
    console.log("DM user registered:", username);
  });

  // ==========================
  // JOIN ROOM
  // ==========================
  socket.on("joinRoom", async ({ roomId, username }) => {
    if (!roomId) roomId = "general";

    if (!rooms[roomId]) {
      rooms[roomId] = { id: roomId, users: new Map() };
    }

    socket.join(roomId);
    socket.data.username = username || socket.data.username || "Guest";
    socket.data.roomId = roomId;

    rooms[roomId].users.set(socket.id, {
      id: socket.id,
      name: socket.data.username
    });

    const recent = await Message.find({ roomId })
      .sort({ ts: 1 })
      .limit(100)
      .lean();

    socket.emit("recentMessages", recent);

    io.to(roomId).emit("systemMessage", { text: `${socket.data.username} joined` });

    io.to(roomId).emit("roomUsers", {
      count: rooms[roomId].users.size,
      list: Array.from(rooms[roomId].users.values())
    });
  });

  // ==========================
  // ROOM MESSAGES
  // ==========================
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
    } catch (err) {
      console.log("Message save error:", err);
      io.to(roomId).emit("message", msg);
    }
  });

  // ==========================
  // OPEN DM WINDOW
  // ==========================
  socket.on("openDM", async ({ from, to }) => {
    const history = await DM.find({
      $or: [
        { from, to },
        { from: to, to: from }
      ]
    })
    .sort({ ts: 1 })
    .limit(100)
    .lean();

    socket.emit("dmHistory", { with: to, history });
  });

  // ==========================
  // SEND DIRECT MESSAGE
  // ==========================
  socket.on("dmMessage", async ({ from, to, text }) => {
    const msg = { from, to, text, ts: Date.now() };

    await DM.create(msg);

    // Send to sender (local window)
    socket.emit("dmMessage", msg);

    // Send to receiver if online
    const targetSocket = onlineUsers.get(to);
    if (targetSocket) {
      io.to(targetSocket).emit("dmMessage", msg);
    }
  });

  // ==========================
  // DISCONNECT
  // ==========================
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].users.delete(socket.id);

      io.to(roomId).emit("systemMessage", { text: `${socket.data.username} left` });

      io.to(roomId).emit("roomUsers", {
        count: rooms[roomId].users.size,
        list: Array.from(rooms[roomId].users.values())
      });
    }

    if (socket.data.username) {
      onlineUsers.delete(socket.data.username);
    }

    console.log("User disconnected:", socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
