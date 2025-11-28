/* modern.js
   Owner Panel - page switching, popups, DM-list and read-only DM handling.
   Paste this as public/owner/modern.js
*/

/* ------------------------------
   Helpers & elements
--------------------------------*/
const overlay = document.getElementById('overlay');
const sidebar = document.getElementById('sidebar');
const pageTitle = document.getElementById('pageTitle');

/* Ensure overlay exists (simple fallback) */
if (!overlay) {
  console.warn('Overlay element not found: #overlay');
}

/* ------------------------------
   MOBILE SIDEBAR TOGGLE
--------------------------------*/
function toggleSidebar() {
  if (!sidebar) return;
  sidebar.classList.toggle('active');
}
window.toggleSidebar = toggleSidebar; // expose for onclick in HTML

/* Close all popups helper */
function closeAllPopups() {
  document.querySelectorAll('.popup').forEach(p => p.classList.add('hidden'));
  if (overlay) overlay.classList.add('hidden');
}

/* ------------------------------
   Page switching (sidebar nav)
--------------------------------*/
document.querySelectorAll('.sidebar nav a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    // hide all sections in main
    document.querySelectorAll('main .page-section').forEach(sec => {
      sec.classList.add('hidden');
      sec.setAttribute('aria-hidden', 'true');
    });

    const target = link.dataset.open + 'Page';
    const targetEl = document.getElementById(target);
    if (targetEl) {
      targetEl.classList.remove('hidden');
      targetEl.setAttribute('aria-hidden', 'false');
    }

    // update active state and title
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    link.classList.add('active');
    pageTitle.innerText = link.innerText.trim();

    // close sidebar on small screens
    sidebar.classList.remove('active');

    // close any open popups
    closeAllPopups();
  });
});

/* On load, ensure dashboard visible */
window.addEventListener('load', () => {
  // show dashboardPage by default
  const dash = document.getElementById('dashboardPage');
  if (dash) {
    document.querySelectorAll('main .page-section').forEach(sec => {
      sec.classList.add('hidden'); sec.setAttribute('aria-hidden', 'true');
    });
    dash.classList.remove('hidden'); dash.setAttribute('aria-hidden', 'false');
    // set active nav
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    const first = document.querySelector('.sidebar nav a[data-open="dashboard"]');
    if (first) first.classList.add('active');
    pageTitle.innerText = 'Dashboard';
  }
});

/* ------------------------------
   Popup open via data-popup attr
   (buttons in table etc.)
--------------------------------*/
document.querySelectorAll('[data-popup]').forEach(btn => {
  btn.addEventListener('click', () => {
    const popupId = btn.dataset.popup;
    const user = btn.dataset.user;
    // fill dynamic labels if present
    if (user) {
      const accessUser = document.getElementById('accessUser');
      const popupDmUser = document.getElementById('popupDmUser');
      if (accessUser) accessUser.textContent = user;
      if (popupDmUser) popupDmUser.textContent = user;
    }
    const popup = document.getElementById(popupId);
    if (popup) {
      popup.classList.remove('hidden');
      if (overlay) overlay.classList.remove('hidden');
      popup.setAttribute('aria-hidden', 'false');
    }
  });
});

/* Close popup buttons (data-close attribute holds popup id) */
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.close;
    const popup = document.getElementById(id);
    if (popup) {
      popup.classList.add('hidden');
      popup.setAttribute('aria-hidden', 'true');
    }
    if (overlay) overlay.classList.add('hidden');
  });
});

/* Click on overlay closes popups */
if (overlay) {
  overlay.addEventListener('click', () => {
    closeAllPopups();
  });
}

/* ------------------------------
   DM LIST (user-wise) handling
   Elements: buttons with data-action="dm-list" and data-user
--------------------------------*/

/* demo DM contacts data (replace with API later) */
const demoDmContacts = {
  "Rohit": [
    { name: "Amit", latest: "Ok bro", time: "5:30 PM" },
    { name: "Simran", latest: "Call u later", time: "3:14 PM" },
    { name: "Guest-55", latest: "Hello", time: "Yesterday" }
  ],
  "Amit": [
    { name: "Rohit", latest: "Seen", time: "4:00 PM" },
    { name: "Simran", latest: "Let's meet", time: "Yesterday" }
  ]
};

/* Handler to open DM-list view for a username */
function openDmListForUser(username) {
  // show users page and reveal dm-list panel
  document.querySelectorAll('main .page-section').forEach(sec => {
    sec.classList.add('hidden'); sec.setAttribute('aria-hidden', 'true');
  });
  const usersPage = document.getElementById('usersPage');
  if (!usersPage) return;
  usersPage.classList.remove('hidden'); usersPage.setAttribute('aria-hidden', 'false');

  // set page title
  pageTitle.innerText = `${username} — DM Overview`;

  const panel = document.getElementById('dmListPanel');
  const title = document.getElementById('dmListTitle');
  const container = document.getElementById('dmListContainer');
  if (!panel || !title || !container) return;

  title.innerText = `${username} — DM Contacts`;
  container.innerHTML = ''; // clear

  const contacts = demoDmContacts[username] || [];
  if (contacts.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.innerText = 'No DM contacts found for this user.';
    container.appendChild(p);
  } else {
    contacts.forEach(c => {
      const div = document.createElement('div');
      div.className = 'dm-list-item';
      div.tabIndex = 0;
      div.innerHTML = `
        <div>
          <strong>${escapeHtml(c.name)}</strong>
          <div class="muted" style="font-size:13px">${escapeHtml(c.latest)}</div>
        </div>
        <div class="muted" style="font-size:13px">${escapeHtml(c.time)}</div>
      `;
      // click opens read-only DM popup for the pair (username <-> contact)
      div.addEventListener('click', () => openDmPopup(username, c.name));
      div.addEventListener('keypress', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') openDmPopup(username, c.name);
      });
      container.appendChild(div);
    });
  }

  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
}

/* attach handlers to existing dm-list buttons */
document.querySelectorAll('[data-action="dm-list"]').forEach(btn => {
  btn.addEventListener('click', () => {
    const user = btn.dataset.user;
    if (user) openDmListForUser(user);
  });
});

/* ------------------------------
   Open DM popup for two users (read-only)
--------------------------------*/
function openDmPopup(userA, userB) {
  const popup = document.getElementById('dmPopup');
  const popupUser = document.getElementById('popupDmUser');
  const popupMessages = document.getElementById('popupChatMessages');

  if (!popup || !popupUser || !popupMessages) return;

  popupUser.textContent = `${userA} ↔ ${userB}`;

  // Demo static messages; replace with backend fetch later
  popupMessages.innerHTML = `
    <p><b>${escapeHtml(userB)}:</b> Hello ${escapeHtml(userA)}</p>
    <p><b>${escapeHtml(userA)}:</b> Hi!</p>
    <p class="muted">-- read-only --</p>
  `;

  popup.classList.remove('hidden');
  popup.setAttribute('aria-hidden', 'false');
  if (overlay) overlay.classList.remove('hidden');
}

/* escape helper to avoid HTML injection from demo text */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ------------------------------
   Demo: top & sidebar logout (no backend)
--------------------------------*/
const topLogout = document.getElementById('topLogout');
const sidebarLogout = document.getElementById('sidebarLogout');
if (topLogout) topLogout.addEventListener('click', () => {
  // Replace alert with real logout API later
  alert('Logout clicked (demo)');
});
if (sidebarLogout) sidebarLogout.addEventListener('click', () => {
  alert('Logout clicked (demo)');
});

/* ------------------------------
   Access popup Save handler (demo)
--------------------------------*/
const saveAccessBtn = document.getElementById('saveAccessBtn');
if (saveAccessBtn) {
  saveAccessBtn.addEventListener('click', () => {
    // example: collect values and show demo message
    const dm = document.getElementById('chkDm')?.checked;
    const media = document.getElementById('chkMedia')?.checked;
    const call = document.getElementById('chkCall')?.checked;
    const friend = document.getElementById('chkFriend')?.checked;
    // Replace with actual API call later
    alert(`Access saved (demo)\nDM:${dm} Media:${media} Call:${call} Friend:${friend}`);
    // close popup
    const popup = document.getElementById('accessPopup');
    if (popup) { popup.classList.add('hidden'); popup.setAttribute('aria-hidden','true'); }
    if (overlay) overlay.classList.add('hidden');
  });
}

/* ------------------------------
   Small UX: keyboard ESC closes popups
--------------------------------*/
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllPopups();
  }
});

/* ------------------------------
   Optional: expose some functions for console/debug
--------------------------------*/
window.ownerPanel = {
  openDmListForUser,
  openDmPopup,
  closeAllPopups
};
