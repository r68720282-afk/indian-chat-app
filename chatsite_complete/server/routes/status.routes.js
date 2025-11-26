const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Chat backend is running",
    time: Date.now()
  });
});

module.exports = router;

