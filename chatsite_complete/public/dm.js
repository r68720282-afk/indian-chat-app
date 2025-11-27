/* public/dm.js
   DM popup client — socket.io integrated
   Paste this file as /public/dm.js
*/

(() => {
  // ---------- Configuration / Permissions ----------
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

  // Helpers to get current username & user type
  function getCurrentUsername() {
    let u = localStorage.getItem('chat_username') || '';
    try {
      const p = JSON.parse(u);
      if (p && p.username) return p.username;
    } catch (e) {}
    return u;
  }
  function getUserType() {
    return localStorage.getItem('chat_user_type') || 'guest';
  }

  // expose currentUser globally for chat pages
  window.currentUserName = getCurrentUsername();

  // ---------- Socket (separate socket for DM) ----------
  const socketDM = io(); // connects to same origin

  socketDM.on('connect', () => {
    // register user with backend for DM routing
    if (window.currentUserName) {
      socketDM.emit('registerUser', window.currentUserName);
    }
  });

  // ---------- DOM / State ----------
  let activeDM = null;      // DOM element of open popup
  let activeTarget = null;  // username of opened DM
  let cachedHistory = {};   // cache by "user1|user2"

  // ---------- TEMPLATE / UI ----------
  function makeDMPopupHTML(target, perms) {
    return `
      <div class="dm-header">
        <div class="dm-user">${escapeHtml(target)}</div>
        <div class="dm-header-buttons">
          <div class="dm-header-btn" data-act="min">–</div>
          <div class="dm-header-btn" data-act="max">▢</div>
          <div class="dm-header-btn" data-act="close">✕</div>
        </div>
      </div>

      <div class="dm-body" data-role="body"></div>

      <div class="dm-footer">
        <div class="dm-tools">
          ${perms.emoji ? `<button class="tool-btn" data-act="emoji" title="Emoji">😊</button>` : ''}
          ${perms.file  ? `<button class="tool-btn" data-act="file" title="Attach">📎</button>` : ''}
          ${perms.mic   ? `<button class="tool-btn" data-act="mic" title="Voice">🎤</button>` : ''}
          ${perms.call  ? `<button class="tool-btn" data-act="call" title="Call">📞</button>` : ''}
          ${perms.video ? `<button class="tool-btn" data-act="video" title="Video">🎥</button>` : ''}
        </div>

        <textarea class="dm-input" data-role="input" placeholder="Type a message..."></textarea>
        <button class="dm-send" data-act="send">Send</button>

        <!-- hidden file input -->
        <input type="file" accept="image/*,video/*,application/*" style="display:none" data-role="file">
      </div>
    `;
  }

  // Escape for safe insertion
  function escapeHtml(s = '') {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ---------- Popup creation / destroy ----------
  function openDM(target) {
    // if same popup already open, focus
    if (activeTarget === target && activeDM) {
      // bring to front (if needed)
      activeDM.style.display = 'flex';
      return;
    }

    // close old
    closeDM();

    // perms
    const userType = getUserType();
    const perms = DM_PERMISSIONS[userType] || DM_PERMISSIONS['guest'];

    // create DOM
    const container = document.createElement('div');
    container.className = 'dm-popup';
    container.innerHTML = makeDMPopupHTML(target, perms);

    document.body.appendChild(container);
    activeDM = container;
    activeTarget = target;

    bindDMPopupEvents(container, target, perms);

    // request history (socket)
    socketDM.emit('dm:open', { from: window.currentUserName, to: target });

    // if cached, render quickly
    const key = dmCacheKey(window.currentUserName, target);
    if (cachedHistory[key]) {
      renderDMHistory(target, cachedHistory[key]);
    }
  }

  function closeDM() {
    if (activeDM) {
      activeDM.remove();
      activeDM = null;
      activeTarget = null;
    }
  }

  // ---------- Cache key ----------
  function dmCacheKey(a, b) {
    // deterministic key independent of order
    if (!a || !b) return '';
    return [a, b].sort().join('|');
  }

  // ---------- Render history / message ----------
  function renderDMHistory(target, list) {
    if (!activeDM || activeTarget !== target) return;
    const body = activeDM.querySelector('[data-role="body"]');
    body.innerHTML = '';
    list.forEach(m => appendDMMessageToBody(body, m, m.from === window.currentUserName));
    body.scrollTop = body.scrollHeight;
  }

  function appendDMMessageToBody(bodyEl, msg, isMe) {
    const d = document.createElement('div');
    d.className = 'dm-msg ' + (isMe ? 'me' : 'them');
    d.innerText = msg.text || (msg.type === 'file' ? '[file]' : '');
    bodyEl.appendChild(d);
  }

  // ---------- bind popup events ----------
  function bindDMPopupEvents(popup, target, perms) {
    // header buttons
    popup.querySelector('[data-act="close"]').onclick = closeDM;
    popup.querySelector('[data-act="min"]').onclick = () => {
      popup.classList.toggle('dm-minimized');
    };
    popup.querySelector('[data-act="max"]').onclick = () => {
      popup.classList.toggle('dm-maximized');
    };

    // send
    const input = popup.querySelector('[data-role="input"]');
    const sendBtn = popup.querySelector('[data-act="send"]');
    sendBtn.onclick = () => sendDMFromPopup(popup, target);

    // enter = send (shift+enter newline)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendDMFromPopup(popup, target);
      }
    });

    // emoji (simple inline emoji picker placeholder)
    const emojiBtn = popup.querySelector('[data-act="emoji"]');
    if (emojiBtn) {
      emojiBtn.onclick = () => {
        // simple small picker (you can replace with full emoji library later)
        showSimpleEmojiPicker(popup, input);
      };
    }

    // file
    const fileBtn = popup.querySelector('[data-act="file"]');
    const fileInput = popup.querySelector('[data-role="file"]');
    if (fileBtn && fileInput) {
      fileBtn.onclick = () => fileInput.click();
      fileInput.onchange = (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        // For now show placeholder file message and (later) upload to server
        const body = popup.querySelector('[data-role="body"]');
        const msg = { from: window.currentUserName, to: target, text: `[file: ${f.name}]`, type: 'file', ts: Date.now() };
        appendDMMessageToBody(body, msg, true);
        body.scrollTop = body.scrollHeight;

        // TODO: upload file to server endpoint, then emit dm:send with type=file + file URL
      };
    }

    // voice/call buttons (UI only for now)
    const micBtn = popup.querySelector('[data-act="mic"]');
    if (micBtn) micBtn.onclick = () => alert('Voice note feature will be added later.');
    const callBtn = popup.querySelector('[data-act="call"]');
    if (callBtn) callBtn.onclick = () => alert('Call (WebRTC) will be added later.');
    const videoBtn = popup.querySelector('[data-act="video"]');
    if (videoBtn) videoBtn.onclick = () => alert('Video call (WebRTC) will be added later.');

    // auto-scroll when new messages added
    const bodyEl = popup.querySelector('[data-role="body"]');
    const observer = new MutationObserver(() => {
      bodyEl.scrollTop = bodyEl.scrollHeight;
    });
    observer.observe(bodyEl, { childList: true });
  }

  // ---------- Simple emoji picker (inline) ----------
  function showSimpleEmojiPicker(popup, inputEl) {
    // if already open, toggle remove
    const existing = popup.querySelector('.dm-emoji-picker');
    if (existing) { existing.remove(); return; }

    const picker = document.createElement('div');
    picker.className = 'dm-emoji-picker';
    picker.style.position = 'absolute';
    picker.style.right = '14px';
    picker.style.bottom = '72px';
    picker.style.background = '#0b1220';
    picker.style.border = '1px solid rgba(255,255,255,0.06)';
    picker.style.padding = '8px';
    picker.style.borderRadius = '8px';
    picker.style.display = 'flex';
    picker.style.gap = '8px';
    picker.style.zIndex = 200000;

    const emojis = ['😊','😂','😍','👍','🔥','😮','😢','🙌','🙏','💯'];
    emojis.forEach(e => {
      const b = document.createElement('button');
      b.innerText = e;
      b.style.fontSize = '18px';
      b.style.background = 'transparent';
      b.style.border = 'none';
      b.style.cursor = 'pointer';
      b.onclick = () => {
        inputEl.value += e;
        inputEl.focus();
      };
      picker.appendChild(b);
    });

    popup.appendChild(picker);

    // close on outside click
    const onDocClick = (ev) => {
      if (!picker.contains(ev.target)) {
        picker.remove();
        document.removeEventListener('click', onDocClick);
      }
    };
    setTimeout(() => document.addEventListener('click', onDocClick), 0);
  }

  // ---------- Send DM (emit) ----------
  function sendDMFromPopup(popup, target) {
    const input = popup.querySelector('[data-role="input"]');
    const text = input.value.trim();
    if (!text) return;

    const payload = {
      from: window.currentUserName,
      to: target,
      text,
      ts: Date.now(),
      type: 'text'
    };

    // optimistic UI append
    const body = popup.querySelector('[data-role="body"]');
    appendDMMessageToBody(body, payload, true);

    // emit to server
    socketDM.emit('dm:send', payload);

    // clear input
    input.value = '';
  }

  // ---------- Socket handlers (DM events) ----------
  // history returned
  socketDM.on('dm:history', (messages) => {
    // server should send array and we must check activeTarget
    if (!Array.isArray(messages)) return;
    // server may send messages for requested pair; put in cache by combining from/to in key
    if (!messages.length) {
      if (activeDM && activeTarget) {
        // show no messages state
        const body = activeDM.querySelector('[data-role="body"]');
        body.innerHTML = `<div class="dm-msg them">No messages yet — say hi 👋</div>`;
      }
      return;
    }

    // determine pair from first message
    const a = messages[0].from;
    const b = messages[0].to;
    const key = dmCacheKey(a, b);
    cachedHistory[key] = messages;

    // render if matches activeTarget
    if (activeTarget && (activeTarget === a || activeTarget === b)) {
      renderDMHistory(activeTarget, messages);
    }
  });

  // new message arrived from server (delivered to recipient)
  socketDM.on('dm:receive', (msg) => {
    if (!msg) return;
    const body = activeDM ? activeDM.querySelector('[data-role="body"]') : null;

    // if popup open with this user — append
    if (activeTarget && (msg.from === activeTarget || msg.to === activeTarget)) {
      if (body) appendDMMessageToBody(body, msg, msg.from === window.currentUserName);
    } else {
      // popup not open — optionally show desktop notification or badge
      // simple console for now
      console.log('New DM from', msg.from, msg);
    }

    // update cache
    const key = dmCacheKey(msg.from, msg.to);
    cachedHistory[key] = cachedHistory[key] || [];
    cachedHistory[key].push(msg);
  });

  // confirm sent (server echoes)
  socketDM.on('dm:sent', (msg) => {
    // server ack for a message we sent — we already optimistically appended
    // update cache
    const key = dmCacheKey(msg.from, msg.to);
    cachedHistory[key] = cachedHistory[key] || [];
    cachedHistory[key].push(msg);
  });

  // ---------- Utility: expose openDM globally ----------
  window.openDM = openDM;

  // ---------- Optional: auto-register if username available ----------
  // (in case currentUserName is set later, server will handle)
  if (window.currentUserName) {
    socketDM.emit('registerUser', window.currentUserName);
  }

  // ---------- CSS for inline emoji picker (small) ----------
  // inject small styles used by dm.js if not included via dm.css
  (function injectSmallStyles(){
    if (document.getElementById('dm-js-inline-styles')) return;
    const st = document.createElement('style');
    st.id = 'dm-js-inline-styles';
    st.innerHTML = `
      .dm-popup { position: fixed; bottom: 0; right: 20px; z-index: 99999; display:flex; flex-direction:column; }
      .dm-emoji-picker button { color: #fff; background: transparent; border: none; cursor: pointer; }
    `;
    document.head.appendChild(st);
  })();

})();
