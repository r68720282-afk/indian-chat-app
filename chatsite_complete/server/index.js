require('dotenv').config(); 
const mongoose = require("mongoose");
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');

// Models
const Message = require("./models/message.model");

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("Mongo Error:", err));

const app = express();
app.use(cors());
app.use(express.json());

// API Routes Import
const statusRoutes = require("./routes/status.routes");
const roomsRoutes = require("./routes/rooms.routes");

// Attach Routes
app.use("/api/status", statusRoutes);
app.use("/api/rooms", roomsRoutes);

// Serve static public folder temporarily
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api', (req, res) => {
  res.json({ status: "Chat server running", time: Date.now() });
});

// Create server + socket
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// In-memory Rooms (used only for user list)
const rooms = {
  general: { id: "general", users: new Set() },
  tech: { id: "tech", users: new Set() },
  random: { id: "random", users: new Set() }
};

// socket handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", async ({ roomId, username }) => {
    if (!roomId) roomId = "general";

    if (!rooms[roomId]) {
      rooms[roomId] = { id: roomId, users: new Set() };
    }

    socket.join(roomId);
    socket.data.username = username || "Guest";
    socket.data.roomId = roomId;

    rooms[roomId].users.add(socket.id);

    // Load last 100 messages from MongoDB
    const recent = await Message.find({ roomId })
      .sort({ ts: 1 })
      .limit(100)
      .lean();

    socket.emit("recentMessages", recent);

    // Notify room
    io.to(roomId).emit("systemMessage", { text: `${socket.data.username} joined` });
    io.to(roomId).emit("roomUsers", { users: rooms[roomId].users.size });
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
      io.to(roomId).emit("roomUsers", { users: rooms[roomId].users.size });
    }
    console.log("User disconnected:", socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
