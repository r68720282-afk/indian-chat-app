const express = require("express");
const cors = require("cors");
const app = express();
const http = require("http").createServer(app);

const io = require("socket.io")(http, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join_room", (room) => {
    socket.join(room);
  });

  socket.on("send_message", (data) => {
    io.to(data.room).emit("receive_message", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log("Server running on " + PORT));
