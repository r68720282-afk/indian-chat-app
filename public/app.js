const socket = io();

let username, room;

function joinChat(){
  username = document.getElementById("username").value.trim();
  room = document.getElementById("room").value.trim() || "global";

  if(!username){
    alert("Enter your name");
    return;
  }

  document.getElementById("loginBox").style.display = "none";
  document.getElementById("chatBox").style.display = "block";

  socket.emit("join_room", room);
}

function sendMessage(){
  let msg = document.getElementById("msg").value;
  if(!msg) return;

  socket.emit("send_message", {
    username,
    room,
    msg
  });

  addMessage(username, msg, true);
  document.getElementById("msg").value = "";
}

socket.on("receive_message", (data) => {
  if(data.username !== username){
    addMessage(data.username, data.msg, false);
  }
});

function addMessage(user, message, me){
  let div = document.createElement("div");
  div.className = "bubble" + (me ? " me" : "");
  div.innerHTML = `<b>${user}:</b> ${message}`;

  document.getElementById("messages").appendChild(div);
  let box = document.getElementById("messages");
  box.scrollTop = box.scrollHeight;
}

