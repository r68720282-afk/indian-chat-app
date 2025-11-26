const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  user: { type: String, default: 'Guest' },
  text: { type: String, default: '' },
  ts: { type: Number, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);
