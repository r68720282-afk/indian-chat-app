/**
 * ADVANCED MESSAGES MODULE
 * Handles:
 *  - Send message
 *  - Delete message
 *  - Edit message
 *  - Typing indicator
 *  - Spam protection
 *  - Read receipts
 */

const crypto = require("crypto");

const MESSAGE_LIMIT = 1000;            // 1000 messages allowed
const MESSAGE_INTERVAL = 4000;      // every 4 sec
const MAX_LENGTH = 500;             // message max size

let MessageModel = null;
try {
  const mongoose = require("mongoose");
  MessageModel = mongoose.models && mongoose.models.Message ? mongoose.models.Message : null;
} catch (e) {
  MessageModel = null;
}

// in-memory last few messages per room
const ROOM_MESSAGES = {}; // room -> array of messages (last 200)

function saveMessage(room, msg) {
  if (!ROOM_MESSAGES[room]) ROOM_MESSAGES[room] = [];
  ROOM_MESSAGES[room].push(msg);

  // keep only last 200
  if (ROOM_MESSAGES[room].length > 200) {
    ROOM_MESSAGES[room].shift();
  }
}

module.exports.handle = function (io, socket) {

  // spam tracking
  socket._msgHistory = [];

  // send message event
  socket.on("msg:send", async (data, cb) => {
    try {
      data = data || {};
      const room = socket.room;

      if (!room) return cb && cb({ ok: false, error: "no_room" });

      let text = (data.text || "").toString().trim();
      let type = data.type || "text"; // "text", "image", "audio", "video"

      if (!text && type === "text") {
        return cb && cb({ ok: false, error: "empty" });
      }

      // length check
      if (text.length > MAX_LENGTH) {
        return cb && cb({ ok: false, error: "too_long" });
      }

      // spam protection
      const now = Date.now();
      socket._msgHistory = socket._msgHistory.filter(t => now - t < MESSAGE_INTERVAL);
      if (socket._msgHistory.length >= MESSAGE_LIMIT) {
        return cb && cb({ ok: false, error: "spam_block" });
      }
      socket._msgHistory.push(now);

      // message object
      const msg = {
        id: crypto.randomBytes(8).toString("hex"),
        room,
        user: socket.username || socket.id,
        text,
        type,
        edited: false,
        time: Date.now()
      };

      saveMessage(room, msg);

      // if MongoDB enabled: save there too
      if (MessageModel) {
        try {
          await MessageModel.create({
            room,
            user: msg.user,
            text,
            type,
            time: msg.time
          });
        } catch (e) {}
      }

      // broadcast to room
      io.to(room).emit("msg:new", msg);

      return cb && cb({ ok: true, msg });

    } catch (e) {
      console.error("msg:send error", e);
      return cb && cb({ ok: false, error: "exception" });
    }
  });

  // typing indicator
  socket.on("msg:typing", () => {
    const room = socket.room;
    if (!room) return;
    socket.to(room).emit("msg:typing", {
      user: socket.username
    });
  });

  // read receipt
  socket.on("msg:read", (msgId) => {
    const room = socket.room;
    if (!room) return;
    socket.to(room).emit("msg:read", {
      id: msgId,
      user: socket.username
    });
  });

  // get last messages
  socket.on("msg:get", (room, cb) => {
    room = room || socket.room;
    if (!ROOM_MESSAGES[room]) ROOM_MESSAGES[room] = [];
    return cb && cb({ ok: true, list: ROOM_MESSAGES[room] });
  });

  // delete message (only owner of msg or room owner)
  socket.on("msg:delete", (data, cb) => {
    try {
      const room = socket.room;
      if (!room) return cb({ ok: false });

      const id = data.id;
      if (!id) return cb({ ok: false });

      if (!ROOM_MESSAGES[room]) return cb({ ok: false });

      const msg = ROOM_MESSAGES[room].find(m => m.id === id);
      if (!msg) return cb({ ok: false });

      const isOwner = socket.isOwner;
      const isSender = msg.user === (socket.username || socket.id);

      if (!isOwner && !isSender) {
        return cb({ ok: false, error: "no_permission" });
      }

      ROOM_MESSAGES[room] = ROOM_MESSAGES[room].filter(m => m.id !== id);

      io.to(room).emit("msg:deleted", { id });
      return cb({ ok: true });

    } catch (e) {
      console.error("msg:delete error", e);
      return cb({ ok: false });
    }
  });

  // edit message
  socket.on("msg:edit", (data, cb) => {
    try {
      const room = socket.room;
      if (!room || !data.id) return cb({ ok: false });

      let text = (data.text || "").trim();
      if (!text) return cb({ ok: false, error: "empty" });

      const msgs = ROOM_MESSAGES[room] || [];
      const msg = msgs.find(m => m.id === data.id);

      if (!msg) return cb({ ok: false });

      const isSender = msg.user === (socket.username || socket.id);
      if (!isSender && !socket.isOwner) {
        return cb({ ok: false, error: "no_permission" });
      }

      msg.text = text;
      msg.edited = true;

      io.to(room).emit("msg:edited", msg);

      return cb({ ok: true });

    } catch (e) {
      console.error("msg:edit error", e);
      return cb({ ok: false });
    }
  });
};


