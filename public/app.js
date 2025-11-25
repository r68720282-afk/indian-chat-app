// ---- Rooms lobby integration ----
const roomsListEl = document.getElementById('roomsList');
const btnCreateRoom = document.getElementById('btnCreateRoom');
const currentRoomTitle = document.getElementById('currentRoomTitle');

let currentRoom = 'global';
window.roomName = currentRoom; // keep for call.js compat

// helper to render rooms
function renderRooms(rooms) {
  roomsListEl.innerHTML = '';
  rooms.forEach(r => {
    const li = document.createElement('li');
    li.dataset.room = r.room;
    li.innerHTML = `<span class="rname">${r.room}</span><span class="rcount">${r.online}</span>`;
    if (r.room === currentRoom) li.classList.add('active');
    li.addEventListener('click', () => {
      joinRoomFromUI(r.room);
    });
    roomsListEl.appendChild(li);
  });
}

// request rooms initially (server will send on connect via 'rooms-list' or we also request)
socket.emit('request-rooms'); // optional, server may ignore
// listen for rooms list
socket.on('rooms-list', (list) => {
  renderRooms(list);
});

// create room button
btnCreateRoom.addEventListener('click', () => {
  const name = prompt('Create room (name):');
  if (!name) return;
  socket.emit('create-room', name, (res) => {
    if (res && res.ok) {
      joinRoomFromUI(res.room);
    } else {
      alert('Could not create room');
    }
  });
});

// join helper
function joinRoomFromUI(room) {
  // leave previous
  if (currentRoom) socket.emit('leave_room', currentRoom);
  currentRoom = room;
  window.roomName = currentRoom;
  currentRoomTitle.textContent = room;
  // clear messages
  const messagesEl = document.getElementById('messages');
  messagesEl.innerHTML = '';
  // join
  socket.emit('join_room', room);
  // fetch recent messages via existing REST endpoint if you have one:
  fetch('/api/fake'); // placeholder - if your REST fetch exists, call it
}

// update online counts for rooms
socket.on('room-online-count', (data) => {
  // update the number in the list if present
  const li = roomsListEl.querySelector(`li[data-room="${data.room}"]`);
  if (li) {
    const span = li.querySelector('.rcount');
    if (span) span.textContent = data.count;
  }
});

// mark default join
joinRoomFromUI('global');
