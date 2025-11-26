const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Basic API
app.get('/api/ping', (req, res) => res.json({ok: true, time: Date.now()}));

// In-memory storage (for demo). Replace with DB in production.
const rooms = {
  'general': { id: 'general', name: 'General', users: new Set(), messages: [] },
  'tech': { id: 'tech', name: 'Tech', users: new Set(), messages: [] }
};

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('joinRoom', ({roomId, username}) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { id: roomId, name: roomId, users: new Set(), messages: [] };
    }
    socket.join(roomId);
    socket.data.username = username || 'Guest';
    socket.data.roomId = roomId;
    rooms[roomId].users.add(socket.id);

    // broadcast join
    io.to(roomId).emit('systemMessage', { text: `${socket.data.username} joined.` });
    io.to(roomId).emit('roomUsers', {
      users: Array.from(rooms[roomId].users).length
    });

    // send recent messages
    socket.emit('recentMessages', rooms[roomId].messages.slice(-50));
  });

  socket.on('sendMessage', ({ roomId, text }) => {
    const msg = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2,8),
      user: socket.data.username || 'Guest',
      text: text,
      ts: Date.now()
    };
    if (!rooms[roomId]) rooms[roomId] = { id: roomId, name: roomId, users: new Set(), messages: [] };
    rooms[roomId].messages.push(msg);
    io.to(roomId).emit('message', msg);
  });

  socket.on('typing', ({ roomId, typing }) => {
    socket.to(roomId).emit('typing', { user: socket.data.username, typing });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].users.delete(socket.id);
      io.to(roomId).emit('systemMessage', { text: `${socket.data.username} left.` });
      io.to(roomId).emit('roomUsers', {
        users: Array.from(rooms[roomId].users).length
      });
    }
    console.log('socket disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log('Server listening on', PORT));
