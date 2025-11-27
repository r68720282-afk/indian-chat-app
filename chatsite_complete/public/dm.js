let activeDM = null;
let currentUserType = localStorage.getItem("chat_type") || "guest"; // user / guest

/* ============ OPEN DM ============ */
function openDM(username) {
  // Close old DM
  if (activeDM) activeDM.remove();

  const popup = document.createElement("div");
  popup.className = "dm-popup";
  popup.innerHTML = dmTemplate(username);

  document.body.appendChild(popup);
  activeDM = popup;

  popup.style.display = "flex";

  attachDMEvents(popup, username);
}

/* ============ TEMPLATE ============ */
function dmTemplate(username) {
  const guest = currentUserType === "guest";

  return `
    <div class='dm-header'>
      <div class='dm-user'>
        <div class='dm-avatar'>${username[0]}</div>
        <div>
          <div class='dm-title'>${username}</div>
          <div class='dm-status'>online</div>
        </div>
      </div>

      <div class='dm-actions'>
        ${icon("min")}
        ${icon("max")}
        ${icon("settings")}
        ${icon("close")}
      </div>
    </div>

    <div class='dm-body'></div>

    <div class='dm-footer'>
      ${icon("emoji")} 
      ${guest ? "" : icon("file")}

      <textarea class='dm-input' placeholder='Type a message...'></textarea>
      <button class='dm-send'>Send</button>
    </div>
  `;
}

/* ============ ICONS ============ */
function icon(t) {
  const s = {
    min: `<button data-act='min'>—</button>`,
    max: `<button data-act='max'>□</button>`,
    close: `<button data-act='close'>✖</button>`,
    settings: `<button data-act='settings'>⚙</button>`,
    emoji: `<button data-act='emoji'>😊</button>`,
    file: `<button data-act='file'>📎</button>`
  };
  return s[t];
}

/* ============ EVENTS ============ */
function attachDMEvents(box, username) {

  box.querySelector("[data-act='close']").onclick = () => {
    box.remove();
    activeDM = null;
  };

  box.querySelector("[data-act='max']").onclick = () => {
    box.classList.toggle("max");
  };

  box.querySelector("[data-act='min']").onclick = () => {
    box.style.display = "none";
    showMini(username, box);
  };

  box.querySelector(".dm-send").onclick = () => {
    const input = box.querySelector(".dm-input");
    const msg = input.value.trim();
    if (!msg) return;

    const body = box.querySelector(".dm-body");
    body.innerHTML += `<div class='dm-bubble me'>${msg}</div>`;
    input.value = "";
    body.scrollTop = body.scrollHeight;
  };

  // Emoji click
  box.querySelector("[data-act='emoji']").onclick = () => {
    const input = box.querySelector(".dm-input");
    input.value += "😊";
  };
}

/* ============ MINI ICON BAR ============ */
function showMini(username, ref) {
  let bar = document.querySelector(".dm-mini-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "dm-mini-bar";
    document.body.appendChild(bar);
  }

  bar.style.display = "flex";

  const item = document.createElement("div");
  item.className = "dm-mini-item";
  item.innerHTML = `<div class='dm-avatar'>${username[0]}</div> ${username}`;

  item.onclick = () => {
    ref.style.display = "flex";
    item.remove();
    if (!bar.children.length) bar.style.display = "none";
  };

  bar.appendChild(item);
}
