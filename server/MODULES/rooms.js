
/**
 * server/modules/rooms.js
 *
 * Advanced Rooms module (in-memory with optional MongoDB fallback)
 *
 * Events (socket):
 *  - rooms:get                -> client requests rooms list
 *  - rooms:create {name,...}  -> create room
 *  - rooms:join {room, password?}
 *  - rooms:leave
 *  - rooms:delete {room}
 *  - rooms:lock {room, lock}
 *  - rooms:setPassword {room, password}
 *  - rooms:setOwner {room, newOwner}  (owner-only)
 *  - rooms:getInfo {room}
 *
 * Broadcasts:
 *  - rooms:list (array)
 *  - room:online {room, count}
 *  - room:system {room, text}
 *
 * NOTE: this module keeps state in memory but will persist to MongoDB
 *       automatically if a Mongoose model named "Room" is available.
 */

const crypto = require('crypto');

// In-memory store
const ROOMS = {}; // { roomName: { name, owner, createdAt, locked, password, users:Set(socketId), score, meta } }
const CREATE_RATE_WINDOW_MS = 30_000; // 30s
const CREATE_RATE_LIMIT = 3; // max creates per window per socket

// optional mongoose Room model (if available)
let RoomModel = null;
try {
  const mongoose = require('mongoose');
  // if user added server/models/Room.js and registered mongoose connection, try to use it
  RoomModel = mongoose.models && mongoose.models.Room ? mongoose.models.Room : null;
} catch (e) {
  RoomModel = null;
}

// util: sanitize room name
function cleanName(name){
  if(!name) return '';
  name = String(name).trim();
  // remove dangerous characters, length cap
  name = name.replace(/[\/\\\?#]/g, '').slice(0, 80);
  return name;
}

function serializeRoom(r){
  return {
    name: r.name,
    owner: r.owner,
    createdAt: r.createdAt,
    locked: !!r.locked,
    hasPassword: !!r.password,
    online: r.users ? r.users.size : 0,
    score: r.score || 0,
    meta: r.meta || {}
  };
}

// load from DB (if model available) into memory at server start
async function loadRoomsFromDB(){
  if(!RoomModel) return;
  try{
    const docs = await RoomModel.find({}).lean().limit(1000);
    docs.forEach(d => {
      if(!ROOMS[d.name]){
        ROOMS[d.name] = {
          name: d.name,
          owner: d.owner,
          createdAt: d.createdAt || Date.now(),
          locked: !!d.locked,
          password: d.password || null,
          users: new Set(),
          score: d.score || 0,
          meta: d.meta || {}
        };
      }
    });
    console.log('rooms.js: loaded rooms from DB:', Object.keys(ROOMS).length);
  }catch(e){
    console.warn('rooms.js: failed to load rooms from DB', e);
  }
}

// persist single room to DB (if model available)
async function persistRoomToDB(roomName){
  if(!RoomModel) return;
  try{
    const r = ROOMS[roomName];
    if(!r) {
      await RoomModel.deleteOne({ name: roomName });
      return;
    }
    await RoomModel.updateOne(
      { name: r.name },
      {
        name: r.name,
        owner: r.owner,
        locked: !!r.locked,
        password: r.password || null,
        score: r.score || 0,
        meta: r.meta || {},
        createdAt: r.createdAt
      },
      { upsert: true }
    );
  }catch(e){
    console.warn('rooms.js: persist error', e);
  }
}

// helper broadcast rooms list sorted by score desc then name
function broadcastRoomsList(io){
  const arr = Object.values(ROOMS).map(serializeRoom);
  arr.sort((a,b) => (b.score - a.score) || a.name.localeCompare(b.name));
  io.emit('rooms:list', arr);
}

// helper to ensure room exists
function ensureRoom(name){
  if(!ROOMS[name]){
    ROOMS[name] = {
      name,
      owner: null,
      createdAt: Date.now(),
      locked: false,
      password: null,
      users: new Set(),
      score: 0,
      meta: {}
    };
  }
  return ROOMS[name];
}

// When module first loaded, attempt DB load (non-blocking)
loadRoomsFromDB().catch(()=>{});

module.exports.handle = function(io, socket){

  // per-socket create rate tracking
  socket._createHistory = socket._createHistory || [];

  // client asks for current rooms list
  socket.on('rooms:get', (cb) => {
    const arr = Object.values(ROOMS).map(serializeRoom);
    arr.sort((a,b) => (b.score - a.score) || a.name.localeCompare(b.name));
    if(typeof cb === 'function') cb(arr);
    // also emit for convenience
    socket.emit('rooms:list', arr);
  });

  // create room
  socket.on('rooms:create', async (opts, cb) => {
    try {
      opts = opts || {};
      const raw = cleanName(opts.name || opts.room || '');
      if(!raw) return cb && cb({ ok:false, error:'empty_name' });

      // rate-limit per socket
      const now = Date.now();
      socket._createHistory = (socket._createHistory || []).filter(t => now - t < CREATE_RATE_WINDOW_MS);
      if(socket._createHistory.length >= CREATE_RATE_LIMIT && !socket.isOwner){
        return cb && cb({ ok:false, error:'rate_limited' });
      }
      socket._createHistory.push(now);

      const name = raw;
      ensureRoom(name);

      // set owner if provided or current user if not set
      if(!ROOMS[name].owner){
        ROOMS[name].owner = socket.username || ('user:' + socket.id.slice(0,6));
      }

      // allow optional password
      if(opts.password) ROOMS[name].password = String(opts.password);

      // optional meta
      if(opts.meta) ROOMS[name].meta = opts.meta;

      // bump score (for trending)
      ROOMS[name].score = (ROOMS[name].score || 0) + 1;

      await persistRoomToDB(name);

      broadcastRoomsList(io);
      io.emit('room:system', { room: name, text: `Room "${name}" created.` });

      return cb && cb({ ok:true, room: serializeRoom(ROOMS[name]) });
    } catch(e){
      console.error('rooms:create err', e);
      return cb && cb({ ok:false, error:'exception' });
    }
  });

  // join room (checks lock/ban/password)
  socket.on('rooms:join', (data, cb) => {
    try {
      data = data || {};
      const room = cleanName(data.room || data.name || '');
      if(!room) return cb && cb({ ok:false, error:'no_room' });

      ensureRoom(room);
      const R = ROOMS[room];

      // banned check (simple username-based ban stored in room.meta.banned set)
      if(R.meta && R.meta.banned){
        const bans = R.meta.banned; // assumed Set or Array
        const uname = socket.username || ('user:' + socket.id.slice(0,6));
        if((bans instanceof Set && bans.has(uname)) || (Array.isArray(bans) && bans.includes(uname))){
          return cb && cb({ ok:false, error:'banned' });
        }
      }

      // locked check
      if(R.locked && !socket.isOwner && R.owner !== (socket.username || null)){
        return cb && cb({ ok:false, error:'room_locked' });
      }

      // password check
      if(R.password){
        const pass = data.password || null;
        if(!pass || String(pass) !== String(R.password)){
          return cb && cb({ ok:false, error:'wrong_password' });
        }
      }

      // join
      if(socket.room && socket.room !== room){
        socket.leave(socket.room);
        // remove from previous room users set
        if(ROOMS[socket.room] && ROOMS[socket.room].users) ROOMS[socket.room].users.delete(socket.id);
        io.to(socket.room).emit('room:online', { room: socket.room, count: ROOMS[socket.room] ? ROOMS[socket.room].users.size : 0 });
      }
      socket.join(room);
      socket.room = room;
      R.users.add(socket.id);

      // bump score for trending
      R.score = (R.score || 0) + 1;

      io.to(room).emit('room:system', { room, text: `${socket.username || socket.id} joined` });
      io.to(room).emit('room:online', { room, count: R.users.size });
      broadcastRoomsList(io);

      return cb && cb({ ok:true, room: serializeRoom(R) });
    } catch(e){
      console.error('rooms:join err', e);
      return cb && cb({ ok:false, error:'exception' });
    }
  });

  // leave current room
  socket.on('rooms:leave', (cb) => {
    try {
      const room = socket.room;
      if(!room) return cb && cb({ ok:false, error:'no_room' });

      socket.leave(room);
      if(ROOMS[room] && ROOMS[room].users) {
        ROOMS[room].users.delete(socket.id);
        io.to(room).emit('room:system', { room, text: `${socket.username || socket.id} left` });
        io.to(room).emit('room:online', { room, count: ROOMS[room].users.size });
      }
      socket.room = null;
      broadcastRoomsList(io);
      return cb && cb({ ok:true });
    } catch(e){
      console.error('rooms:leave err', e);
      return cb && cb({ ok:false, error:'exception' });
    }
  });

  // owner-only: delete room
  socket.on('rooms:delete', async (data, cb) => {
    try {
      const room = cleanName(data && (data.room || data.name));
      if(!room) return cb && cb({ ok:false, error:'no_room' });
      if(!ROOMS[room]) return cb && cb({ ok:false, error:'not_found' });

      // check owner
      const ownerName = ROOMS[room].owner;
      const requester = socket.username || ('user:' + socket.id.slice(0,6));
      if(!socket.isOwner && requester !== ownerName) return cb && cb({ ok:false, error:'not_owner' });

      // kick everyone out
      if(ROOMS[room].users){
        for(const sid of Array.from(ROOMS[room].users)){
          const s = io.sockets.sockets.get(sid);
          if(s){
            s.leave(room);
            s.emit('room:deleted', { room });
            s.room = null;
          }
        }
      }

      // remove from memory and DB
      delete ROOMS[room];
      await persistRoomToDB(room);

      io.emit('room:system', { room, text: `Room "${room}" deleted by ${requester}` });
      broadcastRoomsList(io);
      return cb && cb({ ok:true });
    } catch(e){
      console.error('rooms:delete err', e);
      return cb && cb({ ok:false, error:'exception' });
    }
  });

  // owner-only: lock/unlock room
  socket.on('rooms:lock', async (data, cb) => {
    try {
      const room = cleanName(data && data.room);
      if(!room || !ROOMS[room]) return cb && cb({ ok:false });
      const requester = socket.username || ('user:' + socket.id.slice(0,6));
      if(!socket.isOwner && requester !== ROOMS[room].owner) return cb && cb({ ok:false, error:'not_owner' });
      ROOMS[room].locked = !!data.lock;
      await persistRoomToDB(room);
      io.to(room).emit('room:system', { room, text: `Room ${ROOMS[room].locked ? 'locked' : 'unlocked'} by ${requester}` });
      broadcastRoomsList(io);
      return cb && cb({ ok:true, locked: ROOMS[room].locked });
    } catch(e){
      console.error('rooms:lock err', e);
      return cb && cb({ ok:false, error:'exception' });
    }
  });

  // owner-only: set password
  socket.on('rooms:setPassword', async (data, cb) => {
    try {
      const room = cleanName(data && data.room);
      const pass = data && data.password ? String(data.password) : null;
      if(!room || !ROOMS[room]) return cb && cb({ ok:false });
      const requester = socket.username || ('user:' + socket.id.slice(0,6));
      if(!socket.isOwner && requester !== ROOMS[room].owner) return cb && cb({ ok:false, error:'not_owner' });
      ROOMS[room].password = pass;
      await persistRoomToDB(room);
      io.to(room).emit('room:system', { room, text: `Room password ${pass ? 'set' : 'cleared'} by ${requester}` });
      broadcastRoomsList(io);
      return cb && cb({ ok:true });
    } catch(e){
      console.error('rooms:setPassword err', e);
      return cb && cb({ ok:false, error:'exception' });
    }
  });

  // owner-only: transfer owner
  socket.on('rooms:setOwner', async (data, cb) => {
    try {
      const room = cleanName(data && data.room);
      const newOwner = data && data.username ? String(data.username) : null;
      if(!room || !ROOMS[room]) return cb && cb({ ok:false });
      const requester = socket.username || ('user:' + socket.id.slice(0,6));
      if(!socket.isOwner && requester !== ROOMS[room].owner) return cb && cb({ ok:false, error:'not_owner' });
      ROOMS[room].owner = newOwner;
      await persistRoomToDB(room);
      io.to(room).emit('room:system', { room, text: `Owner changed to ${newOwner} by ${requester}` });
      broadcastRoomsList(io);
      return cb && cb({ ok:true, owner: newOwner });
    } catch(e){
      console.error('rooms:setOwner err', e);
      return cb && cb({ ok:false, error:'exception' });
    }
  });

  // get room info
  socket.on('rooms:getInfo', (data, cb) => {
    const room = cleanName(data && (data.room || data.name));
    if(!room || !ROOMS[room]) return cb && cb({ ok:false, error:'not_found' });
    return cb && cb({ ok:true, room: serializeRoom(ROOMS[room]) });
  });

  // cleanup on disconnect: remove from rooms sets + notify
  socket.on('disconnect', () => {
    try{
      const room = socket.room;
      if(room && ROOMS[room] && ROOMS[room].users){
        ROOMS[room].users.delete(socket.id);
        io.to(room).emit('room:online', { room, count: ROOMS[room].users.size });
      }
      // broadcast updated rooms list
      broadcastRoomsList(io);
    }catch(e){}
  });

}; // end handle

