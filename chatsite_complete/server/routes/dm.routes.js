const router = require("express").Router();
const DMMessage = require("../models/dmMessage.model");

// Load DM messages for 2 users
router.get("/messages", async (req, res) => {
    const { u1, u2 } = req.query;
    const msgs = await DMMessage.find({
        $or: [
            { from: u1, to: u2 },
            { from: u2, to: u1 }
        ]
    }).sort({ ts: 1 });

    res.json(msgs);
});

module.exports = router;
