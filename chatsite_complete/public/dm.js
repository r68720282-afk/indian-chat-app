/* ------------------------------------------------------
   DM POPUP FRONTEND — FULL VERSION (Guest/User Control)
   Style: ChatSite / ChatAvenue popup design
-------------------------------------------------------*/

let activeDM = null;

// Temporary permission system (later Owner Panel will control)
const DM_PERMISSIONS = {
    guest: {
        emoji: true,
        file: false,
        call: false,
        mic: false,
        video: false
    },
    user: {
        emoji: true,
        file: true,
        call: true,
        mic: true,
        video: true
    }
};

// get user type (default guest)
function getUserType() {
    return localStorage.getItem("chat_user_type") || "guest";
}

function openDM(targetUser) {
    closeDM(); // close old popup

    const userType = getUserType();
    const perms = DM_PERMISSIONS[userType];

    const popup = document.createElement("div");
    popup.className = "dm-popup";

    popup.innerHTML = `
        <div class="dm-header">
            <div class="dm-user">${targetUser}</div>
            <div class="dm-header-buttons">
                <div class="dm-header-btn" id="dm-minimize">–</div>
                <div class="dm-header-btn" id="dm-maximize">▢</div>
                <div class="dm-header-btn" id="dm-close">✕</div>
            </div>
        </div>

        <div class="dm-body" id="dm-body"></div>

        <div class="dm-footer">

            <div class="dm-tools">
                ${perms.emoji ? `<button class="tool-btn" id="dm-emoji-btn">😊</button>` : ""}
                ${perms.file ? `<button class="tool-btn" id="dm-file-btn">📎</button>` : ""}
                ${perms.mic ? `<button class="tool-btn" id="dm-mic-btn">🎤</button>` : ""}
                ${perms.call ? `<button class="tool-btn" id="dm-call-btn">📞</button>` : ""}
                ${perms.video ? `<button class="tool-btn" id="dm-video-btn">🎥</button>` : ""}
            </div>

            <textarea class="dm-input" id="dm-input" placeholder="Type a message..."></textarea>
            <button class="dm-send" id="dm-send-btn">Send</button>
        </div>
    `;

    document.body.appendChild(popup);
    activeDM = popup;

    bindDMEvents(targetUser);
}

function bindDMEvents(targetUser) {
    const dm = activeDM;
    if (!dm) return;

    const body = dm.querySelector("#dm-body");
    const input = dm.querySelector("#dm-input");

    // Close button
    dm.querySelector("#dm-close").onclick = closeDM;

    // Minimize button
    dm.querySelector("#dm-minimize").onclick = () => {
        dm.classList.toggle("dm-minimized");
    };

    // Maximize button
    dm.querySelector("#dm-maximize").onclick = () => {
        dm.classList.toggle("dm-maximized");
    };

    // Send button
    dm.querySelector("#dm-send-btn").onclick = () => sendDM(targetUser);

    // Enter key send
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendDM(targetUser);
        }
    });
}

function sendDM(targetUser) {
    const dm = activeDM;
    const body = dm.querySelector("#dm-body");
    const input = dm.querySelector("#dm-input");
    const text = input.value.trim();

    if (!text) return;

    // append message locally
    const msg = document.createElement("div");
    msg.className = "dm-msg me";
    msg.innerText = text;
    body.appendChild(msg);

    body.scrollTop = body.scrollHeight;
    input.value = "";

    // LATER → send via websocket:
    // socket.emit("privateMessage", { to: targetUser, text });
}

function closeDM() {
    if (activeDM) activeDM.remove();
    activeDM = null;
}
/* SOCKET CONNECTION */
const socketDM = io();

/* Register the user for DM system */
socketDM.emit("registerUser", window.currentUserName);

/* Open DM when popup created */
window.openDM = function(username){
    currentDM = username;
    createDMPopup(username);

    socketDM.emit("openDM", {
        from: window.currentUserName,
        to: username
    });
};

/* Receive old DM history */
socketDM.on("dmHistory", (data) => {
    if (!data.history) return;
    renderDMHistory(data.with, data.history);
});

/* Send DM */
window.sendDMMessage = function(to, text){
    socketDM.emit("dmMessage", {
        from: window.currentUserName,
        to,
        text
    });
};

/* Receive DM */
socketDM.on("dmMessage", (msg) => {
    addDMMessage(msg.from === window.currentUserName ? "me" : "other", msg.text, msg.ts);
});
