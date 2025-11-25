const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// In-memory stores (later DB replace करना चाहिए)
const users = {};         // socketId => { username, role, room }
const rooms = { "General": [] };  // room → messages array
const dmLogs = {};        // { "userA-userB": [ { from, to, msg, ts } ] }
const mutedUsers = new Set();

// Helper to build DM key
function dmKey(a, b) {
  // consistent key for two users
  return [a, b].sort().join("-");
}

io.on("connection", (socket) => {
  console.log("New client:", socket.id);

  socket.on("join_room", ({ username, room, role }) => {
    users[socket.id] = { username, role, room };
    socket.join(room);

    // Notify room
    io.to(room).emit("system_message", {
      message: `${username} joined the room.`
    });

    // Send existing room history
    socket.emit("room_history", rooms[room] || []);

    // Broadcast user list
    const userList = Object.values(users)
      .filter(u => u.room === room)
      .map(u => u.username);
    io.to(room).emit("room_users", userList);
  });

  socket.on("send_message", ({ message }) => {
    const user = users[socket.id];
    if (!user) return;
    if (mutedUsers.has(user.username)) {
      socket.emit("muted_notice", "You are muted!");
      return;
    }

    const msgObj = {
      id: Date.now(),
      username: user.username,
      message,
      ts: Date.now()
    };
    rooms[user.room].push(msgObj);
    io.to(user.room).emit("receive_message", msgObj);
  });

  // DM send
  socket.on("dm_send", ({ toUsername, msg }) => {
    const from = users[socket.id]?.username;
    if (!from) return;

    const key = dmKey(from, toUsername);
    if (!dmLogs[key]) dmLogs[key] = [];

    const dmMessage = {
      id: Date.now(),
      from,
      to: toUsername,
      msg,
      ts: Date.now()
    };
    dmLogs[key].push(dmMessage);

    // Send to both users if connected
    for (let id in users) {
      if (users[id].username === toUsername || users[id].username === from) {
        io.to(id).emit("dm_receive", dmMessage);
      }
    }
  });

  // DM history request
  socket.on("dm_history", ({ withUser }) => {
    const from = users[socket.id]?.username;
    if (!from) return;

    const key = dmKey(from, withUser);
    const history = dmLogs[key] || [];
    socket.emit("dm_history_response", history);
  });

  // Owner select user to monitor
  socket.on("owner_select_user", (targetUsername) => {
    const owner = users[socket.id];
    if (!owner || owner.role !== "owner") return;

    // Send room chat + DM logs of that user
    const userChat = [];

    // Collect room messages of that user
    for (let room in rooms) {
      rooms[room].forEach(msg => {
        if (msg.username === targetUsername) {
          userChat.push({ room, ...msg });
        }
      });
    }

    // Collect DM logs for that user
    const userDMs = [];
    for (let key in dmLogs) {
      const [a, b] = key.split("-");
      if (a === targetUsername || b === targetUsername) {
        userDMs.push(...dmLogs[key]);
      }
    }

    socket.emit("owner_user_monitor", {
      username: targetUsername,
      chat: userChat,
      dms: userDMs
    });
  });

  // Kick user
  socket.on("kick_user", (targetUsername) => {
    const admin = users[socket.id];
    if (!admin || (admin.role !== "owner" && admin.role !== "admin")) return;

    for (let id in users) {
      if (users[id].username === targetUsername) {
        io.to(id).emit("kicked");
        io.sockets.sockets.get(id)?.disconnect();
      }
    }
  });

  // Mute user
  socket.on("mute_user", (targetUsername) => {
    const admin = users[socket.id];
    if (!admin || (admin.role !== "owner" && admin.role !== "admin")) return;

    mutedUsers.add(targetUsername);
    io.emit("system_message", { message: `${targetUsername} was muted.` });
  });

  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (user) {
      io.to(user.room).emit("system_message", {
        message: `${user.username} left the room.`
      });

      delete users[socket.id];

      // Broadcast updated user list
      const userList = Object.values(users)
        .filter(u => u.room === user.room)
        .map(u => u.username);
      io.to(user.room).emit("room_users", userList);
    }
  });

});

server.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
