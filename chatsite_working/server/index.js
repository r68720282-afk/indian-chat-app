
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/ping', (req, res) => res.json({ ok: true, time: Date.now() }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// In-memory data
const rooms = {
  general: { id: 'general', name: 'General', users: new Set(), messages: [] },
  tech: { id: 'tech', name: 'Tech', users: new Set(), messages: [] }
};

// helper to get messages (last 100)
function getRecent(roomId) {
  const r = rooms[roomId];
  if (!r) return [];
  return r.messages.slice(-100);
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('joinRoom', ({ roomId, username }) => {
    if (!roomId) roomId = 'general';
    if (!rooms[roomId]) rooms[roomId] = { id: roomId, name: roomId, users: new Set(), messages: [] };
    socket.join(roomId);
    socket.data.username = username || 'Guest';
    socket.data.roomId = roomId;
    rooms[roomId].users.add(socket.id);

    // send recent messages
    socket.emit('recentMessages', getRecent(roomId));

    io.to(roomId).emit('systemMessage', { text: `${socket.data.username} joined.` });
    io.to(roomId).emit('roomUsers', { users: rooms[roomId].users.size });
  });

  socket.on('sendMessage', ({ roomId, text }) => {
    roomId = roomId || socket.data.roomId || 'general';
    const msg = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2,8),
      roomId,
      user: socket.data.username || 'Guest',
      text: String(text || ''),
      ts: Date.now()
    };
    if (!rooms[roomId]) rooms[roomId] = { id: roomId, name: roomId, users: new Set(), messages: [] };
    rooms[roomId].messages.push(msg);
    io.to(roomId).emit('message', msg);
  });

  socket.on('typing', ({ roomId, typing }) => {
    roomId = roomId || socket.data.roomId || 'general';
    socket.to(roomId).emit('typing', { user: socket.data.username, typing });
  });

  socket.on('leaveRoom', ({ roomId }) => {
    roomId = roomId || socket.data.roomId;
    if (roomId && rooms[roomId]) {
      socket.leave(roomId);
      rooms[roomId].users.delete(socket.id);
      io.to(roomId).emit('systemMessage', { text: `${socket.data.username} left.` });
      io.to(roomId).emit('roomUsers', { users: rooms[roomId].users.size });
    }
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].users.delete(socket.id);
      io.to(roomId).emit('systemMessage', { text: `${socket.data.username} disconnected.` });
      io.to(roomId).emit('roomUsers', { users: rooms[roomId].users.size });
    }
    console.log('socket disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log('Server listening on', PORT));
