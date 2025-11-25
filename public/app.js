// at top-level (above io.on) add:
const rooms = {}; // { roomName: { users: Set(socketId), score: number } }

// inside io.on('connection', socket => { ... })
socket.on('join_room', (room) => {
  // join socket.io room
  socket.join(room);

  // ensure room exists
  if (!rooms[room]) rooms[room] = { users: new Set(), score: 0 };

  rooms[room].users.add(socket.id);
  // increment score for trending (simple)
  rooms[room].score = (rooms[room].score || 0) + 1;

  // attach current room on socket for cleanup
  socket.currentRoom = room;

  // notify this socket of current rooms list (optional)
  io.emit('rooms-list', serializeRooms());

  // notify room members of updated online count
  io.to(room).emit('room-online-count', { room, count: rooms[room].users.size });
});

socket.on('leave_room', (room) => {
  try {
    socket.leave(room);
    if (rooms[room]) {
      rooms[room].users.delete(socket.id);
      io.to(room).emit('room-online-count', { room, count: rooms[room].users.size });
      if (rooms[room].users.size === 0) {
        // optional: keep room but lower score; to remove uncomment next line
        // delete rooms[room];
      }
      io.emit('rooms-list', serializeRooms());
    }
  } catch(e){}
});

// when client disconnects, cleanup
socket.on('disconnect', () => {
  const r = socket.currentRoom;
  if (r && rooms[r]) {
    rooms[r].users.delete(socket.id);
    io.to(r).emit('room-online-count', { room: r, count: rooms[r].users.size });
    io.emit('rooms-list', serializeRooms());
  }
});

// create room via socket (client triggers)
socket.on('create-room', (roomName, cb) => {
  if (!roomName) return cb && cb({ ok:false, error:'empty' });
  roomName = roomName.trim().slice(0, 80);
  if (!rooms[roomName]) {
    rooms[roomName] = { users: new Set(), score: 0 };
  }
  io.emit('rooms-list', serializeRooms());
  cb && cb({ ok:true, room: roomName });
});

// helper to convert rooms map to array
function serializeRooms() {
  // returns sorted array by score desc
  const arr = Object.keys(rooms).map(r => ({
    room: r,
    online: rooms[r].users.size,
    score: rooms[r].score || 0
  }));
  // sort by score desc then name
  arr.sort((a,b) => b.score - a.score || a.room.localeCompare(b.room));
  return arr;
}
