const socket = io();

// DOM
const loginPanel = document.getElementById("loginPanel");
const usernameInput = document.getElementById("username");
const roleSelect = document.getElementById("role");
const joinBtn = document.getElementById("joinBtn");

const chatApp = document.getElementById("chatApp");
const usersList = document.getElementById("usersList");
const messagesDiv = document.getElementById("messages");

const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");

const selectUser = document.getElementById("selectUser");
const monitorBtn = document.getElementById("monitorBtn");
const monitorOutput = document.getElementById("monitorOutput");

const kickBtn = document.getElementById("kickBtn");
const muteBtn = document.getElementById("muteBtn");

const dmHistoryBtn = document.getElementById("dmHistoryBtn");
const dmHistoryDiv = document.getElementById("dmHistory");

let myUsername, myRole;

joinBtn.onclick = () => {
  myUsername = usernameInput.value.trim();
  myRole = roleSelect.value;
  if (!myUsername) {
    alert("Enter username");
    return;
  }

  socket.emit("join_room", { username: myUsername, room: "General", role: myRole });

  loginPanel.classList.add("hidden");
  chatApp.classList.remove("hidden");

  if (myRole === "owner") {
    document.getElementById("ownerControls").classList.remove("hidden");
  }
};

sendBtn.onclick = () => {
  const msg = msgInput.value.trim();
  if (!msg) return;
  socket.emit("send_message", { message: msg });
  msgInput.value = "";
};

socket.on("receive_message", (msgObj) => {
  const p = document.createElement("p");
  p.innerText = `${msgObj.username}: ${msgObj.message}`;
  messagesDiv.appendChild(p);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

socket.on("system_message", (data) => {
  const p = document.createElement("p");
  p.style.fontStyle = "italic";
  p.innerText = data.message;
  messagesDiv.appendChild(p);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

socket.on("room_history", (history) => {
  history.forEach(msg => {
    const p = document.createElement("p");
    p.innerText = `${msg.username}: ${msg.message}`;
    messagesDiv.appendChild(p);
  });
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

socket.on("room_users", (list) => {
  usersList.innerHTML = "";
  list.forEach(u => {
    const li = document.createElement("li");
    li.innerText = u;
    usersList.appendChild(li);
  });
});

// OWNER MONITORING
monitorBtn.onclick = () => {
  const target = selectUser.value.trim();
  if (!target) return alert("Enter username to monitor");
  socket.emit("owner_select_user", target);
  monitorOutput.innerHTML = "Loading...";
};

socket.on("owner_user_monitor", (data) => {
  monitorOutput.innerHTML = `<h4>Monitoring ${data.username}</h4>`;
  monitorOutput.innerHTML += `<b>Chat:</b><br>`;
  data.chat.forEach(m => {
    monitorOutput.innerHTML += `[${m.room}] ${m.username}: ${m.message}<br>`;
  });
  monitorOutput.innerHTML += `<b>DMs:</b><br>`;
  data.dms.forEach(dm => {
    monitorOutput.innerHTML += `${dm.from} → ${dm.to}: ${dm.msg}<br>`;
  });
});

// KICK / MUTE
kickBtn.onclick = () => {
  const target = selectUser.value.trim();
  if (!target) return alert("Enter username to kick");
  socket.emit("kick_user", target);
};

muteBtn.onclick = () => {
  const target = selectUser.value.trim();
  if (!target) return alert("Enter username to mute");
  socket.emit("mute_user", target);
};

// DM HISTORY
dmHistoryBtn.onclick = () => {
  const withUser = prompt("DM with user:");
  if (!withUser) return;
  socket.emit("dm_history", { withUser });
};

socket.on("dm_receive", (msg) => {
  alert(`DM from ${msg.from}: ${msg.msg}`);
});

socket.on("dm_history_response", (history) => {
  dmHistoryDiv.innerHTML = `<h5>Chat with ${history[0]?.from === myUsername ? history[0].to : history[0].from}</h5>`;
  history.forEach(m => {
    const div = document.createElement("div");
    div.innerText = `${m.from}: ${m.msg}`;
    dmHistoryDiv.appendChild(div);
  });
});
