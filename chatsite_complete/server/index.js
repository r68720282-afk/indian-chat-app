require('dotenv').config(); 
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("Mongo Error:", err));

const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend later (React or public) – अभी blank चलेगा
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api', (req, res) => {
  res.json({ status: "Chat server running", time: Date.now() });
});

// Create server + socket
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// In-memory Rooms (MongoDB बाद में add करेंगे)
const rooms = {
  general: { id: "general", users: new Set(), messages: [] },
  tech: { id: "tech", users: new Set(), messages: [] },
  random: { id: "random", users: new Set(), messages: [] }
};

// get last 100 messages
function getRecentMessages(roomId) {
  return rooms[roomId]?.messages.slice(-100) || [];
}

// socket handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ roomId, username }) => {
    if (!roomId) roomId = "general";
    if (!rooms[roomId]) {
      rooms[roomId] = { id: roomId, users: new Set(), messages: [] };
    }

    socket.join(roomId);
    socket.data.username = username || "Guest";
    socket.data.roomId = roomId;

    rooms[roomId].users.add(socket.id);

    // send recent messages
    socket.emit("recentMessages", getRecentMessages(roomId));

    // notify room
    io.to(roomId).emit("systemMessage", { text: `${socket.data.username} joined` });
    io.to(roomId).emit("roomUsers", { users: rooms[roomId].users.size });
  });

  socket.on("sendMessage", ({ roomId, text }) => {
    roomId = roomId || socket.data.roomId;

    const msg = {
      id: Date.now(),
      user: socket.data.username,
      text,
      ts: Date.now()
    };

    rooms[roomId].messages.push(msg);
    io.to(roomId).emit("message", msg);
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
// Main server entry placeholder
