/* ---------------------------------
   DM POPUP FRONTEND v1
   (Guest / Registered permissions ready)
-----------------------------------*/

let activeDM = null;

// Temporary local permissions (later backend controlled)
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

// get user type
function getUserType() {
    return localStorage.getItem("chat_user_type") || "guest"; 
}

function openDM(targetUser) {
    closeDM(); // close old popup

    const type = getUserType();
    const perms = DM_PERMISSIONS[type];

    const popup = document.createElement("div");
    popup.className = "dm-popup";

    popup.innerHTML = `
        <div class="dm-header">
            <div class="dm-user">${targetUser}</div>
            <div class="dm-actions">
                <button class="dm-btn" id="dm-min">—</button>
                <button class="dm-btn" id="dm-max">▢</button>
                <button class="dm-btn" id="dm-close">✕</button>
            </div>
        </div>

        <div class="dm-body"></div>

        <div class="dm-footer">

            <div class="dm-tools">
                ${ perms.emoji ? `<button class="tool-btn" id="dm-emoji">😊</button>` : "" }
                ${ perms.file  ? `<button class="tool-btn" id="dm-file">📎</button>` : "" }
                ${ perms.mic   ? `<button class="tool-btn" id="dm-mic">🎤</button>` : "" }
                ${ perms.call  ? `<button class="tool-btn" id="dm-call">📞</button>` : "" }
                ${ perms.video ? `<button class="tool-btn" id="dm-video">🎥</button>` : "" }
            </div>

            <textarea class="dm-input" placeholder="Type a message..."></textarea>
            <button class="dm-send">Send</button>
        </div>
    `;

    document.body.appendChild(popup);
    activeDM = popup;

    bindDMEvents(popup, targetUser);
}

function bindDMEvents(dm, targetUser) {
    dm.querySelector("#dm-close").onclick = closeDM;

    dm.querySelector("#dm-min").onclick = () => {
        dm.classList.toggle("dm-minimized");
    };

    dm.querySelector("#dm-max").onclick = () => {
        dm.classList.toggle("dm-maximized");
    };

    dm.querySelector(".dm-send").onclick = () => sendDM(dm, targetUser);
}

function sendDM(dm, targetUser) {
    const input = dm.querySelector(".dm-input");
    const body = dm.querySelector(".dm-body");

    if (!input.value.trim()) return;

    const msg = document.createElement("div");
    msg.className = "dm-msg me";
    msg.innerText = input.value;
    body.appendChild(msg);

    body.scrollTop = body.scrollHeight;
    input.value = "";
}

function closeDM() {
    if (activeDM) activeDM.remove();
    activeDM = null;
}
