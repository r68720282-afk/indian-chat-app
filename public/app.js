// ================================
// ADVANCED CHAT FRONTEND (app.js)
// ================================

// Connect to socket.io server
const socket = io();

// DOM Elements
const loginPanel = document.getElementById("loginPanel");
const nameInput = document.getElementById("username");
const joinBtn = document.getElementById("joinBtn");

const chatBox = document.getElementById("chatBox");
const messagesDiv = document.getElementById("messages");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");

const usersListDiv = document.getElementById("users");
const adminPanel = document.getElementById("adminPanel");

// Track my role
let myRole = "user";
let myUsername = "";

// ---------------------------
// JOIN CHAT
// ---------------------------
joinBtn.onclick = () => {
  const username = nameInput.value.trim();
  if (!username) return alert("Enter a username");

  myUsername = username;

  // Demo roles
  if (username.toLowerCase() === "owner") myRole = "owner";
  else if (username.toLowerCase() === "admin") myRole = "admin";

  socket.emit("joinRoom", { username, room: "main", role: myRole });

  loginPanel.style.display = "none";
  chatBox.style.display = "flex";

  // Show admin panel for owner/admin
  if (myRole === "owner" || myRole === "admin") {
    adminPanel.style.display = "block";
  }
};

// ---------------------------
// SEND MESSAGE
// ---------------------------
sendBtn.onclick = () => {
  const msg = msgInput.value.trim();
  if (!msg) return;
  socket.emit("sendMsg", msg);
  msgInput.value = "";
};

// Send message on Enter key
msgInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendBtn.click();
});

// ---------------------------
// RECEIVE PUBLIC MESSAGE
// ---------------------------
socket.on("chatMsg", (data) => {
  const p = document.createElement("p");
  p.style.color = data.color;
  p.innerHTML = `<b>${data.user}:</b> ${data.text}`;
  messagesDiv.appendChild(p);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// ---------------------------
// RECEIVE USER LIST
// ---------------------------
socket.on("userList", (list) => {
  usersListDiv.innerHTML = "<h3>Users</h3>";
  list.forEach(u => {
    usersListDiv.innerHTML += `<p>${u}</p>`;
  });
});

// ---------------------------
// PRIVATE DM
// ---------------------------
function sendDM() {
  const target = prompt("Enter username for DM:");
  const msg = prompt("Enter message:");
  if (!target || !msg) return;

  socket.emit("dm", { toUsername: target, msg });
}

socket.on("dmReceive", (data) => {
  alert(`DM from ${data.from}: ${data.msg}`);
});

// Owner DM Viewer
socket.on("ownerDMView", (data) => {
  if (myRole === "owner") {
    console.log(`Owner DM View: ${data.from} -> ${data.to}: ${data.msg}`);
  }
});

// ---------------------------
// ADMIN / OWNER COMMANDS
// ---------------------------

// KICK
document.getElementById("kickBtn").onclick = () => {
  const target = prompt("Enter username to kick:");
  if (target) socket.emit("kickUser", target);
};

// MUTE
document.getElementById("muteBtn").onclick = () => {
  const target = prompt("Enter username to mute:");
  if (target) socket.emit("muteUser", target);
};

// BAN (Owner only)
document.getElementById("banBtn").onclick = () => {
  const target = prompt("Enter username to ban:");
  socket.emit("banUser", target);
};

// DELETE MESSAGE
document.getElementById("deleteMsgBtn").onclick = () => {
  const msgId = prompt("Enter message ID to delete:");
  socket.emit("deleteMsg", { room: "main", msgId });
};

// ---------------------------
// KICK / MUTE / BAN FEEDBACK
// ---------------------------
socket.on("kicked", () => {
  alert("You were kicked by an admin.");
  location.reload();
});

socket.on("muted", () => {
  alert("You are muted by admin.");
});

socket.on("banned", () => {
  alert("You are banned by owner.");
});

socket.on("notification", (msg) => {
  const p = document.createElement("p");
  p.style.color = "#ffcc00";
  p.innerHTML = `<b>System:</b> ${msg}`;
  messagesDiv.appendChild(p);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// ---------------------------
// TYPING INDICATOR
// ---------------------------
msgInput.addEventListener("input", () => {
  socket.emit("typing", msgInput.value.trim() !== "");
});

socket.on("typing", (data) => {
  const typingDiv = document.getElementById("typing");
  if (!data.isTyping) {
    typingDiv.innerHTML = "";
    return;
  }
  typingDiv.innerHTML = `${data.username} is typing...`;
});

// ---------------------------
// DELETE MESSAGE RECEIVED
// ---------------------------
socket.on("deleteMsg", (msgId) => {
  const msgElement = document.getElementById(msgId);
  if (msgElement) msgElement.remove();
});
