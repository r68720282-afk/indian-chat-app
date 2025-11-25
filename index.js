// ================================
// ADVANCED CHAT SERVER (index.js)
// ================================

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const geoip = require("geoip-lite"); // For basic IP location

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// Serve public folder
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// GLOBAL STORAGE
// ===============================
const users = {};     // socket.id => { username, role, room, ip }
const rooms = {};     // room => [username]
const muted = {};     // username => true
const banned = {};    // username => true
const deviceMap = {}; // ip => [username]

// ===============================
// SOCKET.IO CONNECTION
// ===============================
io.on("connection", (socket) => {

  // -------- JOIN ROOM --------
  socket.on("joinRoom", ({ username, room, role }) => {

    // Check if banned
    if (banned[username]) {
      socket.emit("banned");
      return;
    }

    socket.join(room);

    // Store user info
    const ip = socket.handshake.address;
    const geo = geoip.lookup(ip) || {};
    users[socket.id] = { username, role, room, ip, geo };

    // Add to room
    if (!rooms[room]) rooms[room] = [];
    rooms[room].push(username);

    // Track device/IP
    if (!deviceMap[ip]) deviceMap[ip] = [];
    deviceMap[ip].push(username);

    // Notify room
    io.to(room).emit("chatMsg", {
      user: "System",
      text: `${username} joined the room`,
      color: "#f4ae3c"
    });

    // Update user list
    io.to(room).emit("userList", rooms[room]);
  });

  // -------- PUBLIC MESSAGE --------
  socket.on("sendMsg", (msg) => {
    const user = users[socket.id];
    if (!user) return;

    // Check mute
    if (muted[user.username]) {
      socket.emit("muted");
      return;
    }

    io.to(user.room).emit("chatMsg", {
      user: user.username,
      text: msg,
      color: user.role === "owner" ? "#00ffff" :
             user.role === "admin" ? "#ff4d4d" :
             "#ffffff"
    });
  });

  // -------- PRIVATE DM --------
  socket.on("dm", ({ toUsername, msg }) => {
    const sender = users[socket.id];
    if (!sender) return;

    // Find socket id of target user
    let targetId = null;
    for (let id in users) {
      if (users[id].username === toUsername) targetId = id;
    }
    if (!targetId) return;

    // Send DM to target
    io.to(targetId).emit("dmReceive", {
      from: sender.username,
      msg
    });

    // Optionally owner can view all DMs
    for (let id in users) {
      if (users[id].role === "owner") {
        io.to(id).emit("ownerDMView", {
          from: sender.username,
          to: toUsername,
          msg
        });
      }
    }
  });

  // -------- KICK USER --------
  socket.on("kickUser", (targetUser) => {
    const admin = users[socket.id];
    if (!admin || (admin.role !== "admin" && admin.role !== "owner")) return;

    for (let id in users) {
      if (users[id].username === targetUser) {
        io.to(id).emit("kicked");
        io.sockets.sockets.get(id)?.disconnect();

        // Remove from room
        const room = users[id].room;
        rooms[room] = rooms[room].filter(u => u !== targetUser);

        io.to(room).emit("userList", rooms[room]);
        io.to(room).emit("chatMsg", {
          user: "System",
          text: `${targetUser} was kicked by ${admin.username}`,
          color: "#ff4444"
        });
      }
    }
  });

  // -------- MUTE USER --------
  socket.on("muteUser", (targetUser) => {
    const admin = users[socket.id];
    if (!admin || (admin.role !== "admin" && admin.role !== "owner")) return;

    muted[targetUser] = true;
    io.emit("notification", `${targetUser} has been muted`);
  });

  // -------- BAN USER (OWNER ONLY) --------
  socket.on("banUser", (targetUser) => {
    const owner = users[socket.id];
    if (!owner || owner.role !== "owner") return;

    banned[targetUser] = true;
    io.emit("notification", `${targetUser} has been banned`);
  });

  // -------- DELETE MESSAGE (Admin/Owner) --------
  socket.on("deleteMsg", ({ room, msgId }) => {
    const user = users[socket.id];
    if (!user || (user.role !== "admin" && user.role !== "owner")) return;

    io.to(room).emit("deleteMsg", msgId);
  });

  // -------- TYPING INDICATOR --------
  socket.on("typing", (isTyping) => {
    const user = users[socket.id];
    if (!user) return;

    socket.to(user.room).emit("typing", {
      username: user.username,
      isTyping
    });
  });

  // -------- DISCONNECT --------
  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (!user) return;

    const { username, room, ip } = user;

    // Remove from room
    if (rooms[room]) {
      rooms[room] = rooms[room].filter(u => u !== username);
      io.to(room).emit("userList", rooms[room]);
    }

    // Remove from device map
    if (deviceMap[ip]) {
      deviceMap[ip] = deviceMap[ip].filter(u => u !== username);
    }

    io.to(room).emit("chatMsg", {
      user: "System",
      text: `${username} left the room`,
      color: "#f4ae3c"
    });

    delete users[socket.id];
  });

});

// -------- START SERVER --------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
