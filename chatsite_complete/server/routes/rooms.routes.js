const express = require("express");
const router = express.Router();

const rooms = ["general", "tech", "random"];

router.get("/", (req, res) => {
  res.json({
    success: true,
    rooms
  });
});

module.exports = router;

