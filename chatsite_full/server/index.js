require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const Message = require('./models/message.model');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/ping', (req, res) => res.json({ ok: true, time: Date.now() }));

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.warn('MONGO_URI not set. Messages will not persist.');
} else {
  mongoose.connect(MONGO_URI, { })
    .then(()=> console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// In-memory rooms & online tracking (fallback)
const rooms = {
  'general': { id: 'general', name: 'General', users: new Set() },
  'tech': { id: 'tech', name: 'Tech', users: new Set() }
};

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('joinRoom', async ({ roomId, username }) => {
    if (!roomId) roomId = 'general';
    if (!rooms[roomId]) rooms[roomId] = { id: roomId, name: roomId, users: new Set() };
    socket.join(roomId);
    socket.data.username = username || 'Guest';
    socket.data.roomId = roomId;
    rooms[roomId].users.add(socket.id);

    // send recent messages from DB if available
    try {
      if (MONGO_URI) {
        const recent = await Message.find({ roomId }).sort({ ts: -1 }).limit(50).lean();
        socket.emit('recentMessages', recent.reverse());
      } else {
        socket.emit('recentMessages', []);
      }
    } catch (e) {
      console.error('Failed to load recent messages', e);
      socket.emit('recentMessages', []);
    }

    io.to(roomId).emit('systemMessage', { text: `${socket.data.username} joined.` });
    io.to(roomId).emit('roomUsers', { users: Array.from(rooms[roomId].users).length });
  });

  socket.on('sendMessage', async ({ roomId, text }) => {
    const msg = {
      roomId: roomId || socket.data.roomId || 'general',
      user: socket.data.username || 'Guest',
      text: String(text || ''),
      ts: Date.now()
    };

    // persist to DB if possible
    try {
      if (MONGO_URI) {
        const m = new Message(msg);
        await m.save();
        io.to(msg.roomId).emit('message', m);
      } else {
        io.to(msg.roomId).emit('message', msg);
      }
    } catch (e) {
      console.error('Failed to save message', e);
      io.to(msg.roomId).emit('message', msg);
    }
  });

  socket.on('typing', ({ roomId, typing }) => {
    socket.to(roomId).emit('typing', { user: socket.data.username, typing });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].users.delete(socket.id);
      io.to(roomId).emit('systemMessage', { text: `${socket.data.username} left.` });
      io.to(roomId).emit('roomUsers', { users: Array.from(rooms[roomId].users).length });
    }
    console.log('socket disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log('Server listening on', PORT));
