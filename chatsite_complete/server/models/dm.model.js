const mongoose = require("mongoose");

const dmSchema = new mongoose.Schema({
  from: { type: String, required: true },     // username
  to: { type: String, required: true },       // username
  text: { type: String, required: true },
  ts: { type: Number, default: Date.now }
});

module.exports = mongoose.model("DM", dmSchema);
