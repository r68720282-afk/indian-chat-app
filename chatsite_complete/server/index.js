const mongoose = require("mongoose");
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');

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

// SOCKET HANDLING
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", async ({ roomId, username }) => {
    if (!roomId) roomId = "general";

    // Create room if not exists
    if (!rooms[roomId]) {
      rooms[roomId] = { id: roomId, users: new Map() };
    }

    socket.join(roomId);
    socket.data.username = username || "Guest";
    socket.data.roomId = roomId;

    // Save user in MAP
    rooms[roomId].users.set(socket.id, {
      id: socket.id,
      name: socket.data.username
    });

    // Load last 100 messages from MongoDB
    const recent = await Message.find({ roomId })
      .sort({ ts: 1 })
      .limit(100)
      .lean();

    socket.emit("recentMessages", recent);

    // System join message
    io.to(roomId).emit("systemMessage", { text: `${socket.data.username} joined` });

    // Send full user list
    io.to(roomId).emit("roomUsers", {
      count: rooms[roomId].users.size,
      list: Array.from(rooms[roomId].users.values())
    });
  });

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
      io.to(roomId).emit("message", msg); // fallback
    }
  });

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

    console.log("User disconnected:", socket.id);
  });
});

// Start
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
