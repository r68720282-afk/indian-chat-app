const mongoose = require("mongoose");
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
// DM system
const DM = require("./models/dm.model");

// store connected users 
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
    if
