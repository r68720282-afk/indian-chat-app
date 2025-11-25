// public/call.js
// Requires: socket.io client already loaded and connected (socket variable)
// This file implements simple one-to-one call using room-based signaling.
// It uses existing socket connection from app.js (where io() called).
// If your app.js uses `const socket = io();` this will reuse same socket.

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callUI = document.getElementById('callUI');

const btnStartCall = document.getElementById('btnStartCall');
const btnAnswerCall = document.getElementById('btnAnswerCall');
const btnEndCall = document.getElementById('btnEndCall');
const btnToggleMic = document.getElementById('btnToggleMic');
const btnToggleCam = document.getElementById('btnToggleCam');

let localStream = null;
let pc = null;
let isCaller = false;
let currentRoom = null;
let micOn = true;
let camOn = true;

// STUN servers (public)
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
    // For production add TURN here
  ]
};

// Ensure socket exists (from app.js)
if (typeof socket === 'undefined') {
  console.error('Socket.io not found. Ensure app.js creates `socket` with io() before call.js');
}

// UI helpers
function showCallUI(show) {
  callUI.style.display = show ? 'block' : 'none';
}

function showControl(btn, show) { btn.style.display = show ? 'inline-block' : 'none'; }

// Start local media
async function startLocalMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (e) {
    console.error('getUserMedia error', e);
    alert('Could not access camera/microphone. Allow permissions and retry.');
    throw e;
  }
}

// Create RTCPeerConnection and attach handlers
function createPeerConnection() {
  pc = new RTCPeerConnection(RTC_CONFIG);

  // send any new ice candidates to remote via signaling
  pc.onicecandidate = event => {
    if (event.candidate) {
      socket.emit('webrtc-candidate', { room: currentRoom, candidate: event.candidate });
    }
  };

  // when remote track arrives, put it to remoteVideo
  pc.ontrack = event => {
    // In many browsers event.streams[0] contains the stream
    if (remoteVideo.srcObject !== event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    }
  };

  // add local tracks
  if (localStream) {
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }
  }

  return pc;
}

// Call flow: caller creates offer, emits to room
async function startCall(room) {
  isCaller = true;
  currentRoom = room;
  showCallUI(true);
  await startLocalMedia();
  pc = createPeerConnection();
  showControl(btnEndCall, true);
  showControl(btnToggleMic, true);
  showControl(btnToggleCam, true);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('webrtc-offer', { room, sdp: pc.localDescription });
  console.log('Offer sent');
}

// When receiving offer (callee)
async function onOffer(data) {
  const { room, sdp } = data;
  isCaller = false;
  currentRoom = room;
  showCallUI(true);
  // show answer button to user
  showControl(btnAnswerCall, true);
  await startLocalMedia(); // prepare local stream but don't auto-answer until user clicks Answer
  pc = createPeerConnection();
}

// Answer the call (callee clicks Answer)
async function answerCall() {
  showControl(btnAnswerCall, false);
  showControl(btnEndCall, true);
  showControl(btnToggleMic, true);
  showControl(btnToggleCam, true);

  await pc.setRemoteDescription(new RTCSessionDescription()); // placeholder in some browsers
  // set remote from the offer stored in signaling
  // We need to request offer details -- but offer was passed in onOffer callback; let's set it there
  // NOTE: We'll keep lastOffer in closure
  if (lastOffer) {
    await pc.setRemoteDescription(new RTCSessionDescription(lastOffer));
  }
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('webrtc-answer', { room: currentRoom, sdp: pc.localDescription });
  console.log('Answer sent');
}

// store last offer when received
let lastOffer = null;

// End call and cleanup
function endCall() {
  if (pc) {
    try { pc.getSenders().forEach(s => s.track && s.track.stop()); } catch(e){}
    pc.close();
    pc = null;
  }
  if (localStream) {
    try { localStream.getTracks().forEach(t => t.stop()); } catch(e){}
    localStream = null;
  }
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  showCallUI(false);
  showControl(btnEndCall, false);
  showControl(btnToggleMic, false);
  showControl(btnToggleCam, false);
  showControl(btnAnswerCall, false);
  socket.emit('webrtc-hangup', { room: currentRoom });
  currentRoom = null;
  isCaller = false;
}

// toggle mic
function toggleMic() {
  if (!localStream) return;
  micOn = !micOn;
  localStream.getAudioTracks().forEach(t => t.enabled = micOn);
  btnToggleMic.textContent = micOn ? 'Mute' : 'Unmute';
}

// toggle camera
function toggleCam() {
  if (!localStream) return;
  camOn = !camOn;
  localStream.getVideoTracks().forEach(t => t.enabled = camOn);
  btnToggleCam.textContent = camOn ? 'Camera Off' : 'Camera On';
}

// ===== socket signaling handlers =====
socket.on('webrtc-offer', async (data) => {
  console.log('Received offer', data);
  lastOffer = data.sdp;
  await onOffer(data);
});

socket.on('webrtc-answer', async (data) => {
  console.log('Received answer', data);
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
});

socket.on('webrtc-candidate', async (data) => {
  if (!pc) return;
  try {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  } catch (e) {
    console.warn('Error adding received ice candidate', e);
  }
});

socket.on('webrtc-hangup', (data) => {
  console.log('Remote hangup');
  endCall();
});

// UI button events
btnStartCall.addEventListener('click', () => {
  // we will start a call within current chat room
  const room = window.roomName || (document.getElementById('room') && document.getElementById('room').value) || 'global';
  socket.emit('join-call-room', { room });
  startCall(room).catch(console.error);
});

btnAnswerCall.addEventListener('click', async () => {
  // set remote description from stored offer and answer
  if (lastOffer) {
    await pc.setRemoteDescription(new RTCSessionDescription(lastOffer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('webrtc-answer', { room: currentRoom, sdp: pc.localDescription });
    showControl(btnAnswerCall, false);
    showControl(btnEndCall, true);
    showControl(btnToggleMic, true);
    showControl(btnToggleCam, true);
  } else {
    console.warn('No offer present');
  }
});

btnEndCall.addEventListener('click', () => {
  endCall();
});

btnToggleMic.addEventListener('click', toggleMic);
btnToggleCam.addEventListener('click', toggleCam);

// When we join a call room we notify server
socket.on('joined-call-room', (data) => {
  console.log('Joined call room', data);
});

// When another user in room emits "incoming-call" we show answer button
socket.on('incoming-call', (data) => {
  console.log('Incoming call', data);
  // If not caller, show answer button
  if (!isCaller) {
    showControl(btnAnswerCall, true);
  }
});

// export for debugging
window._call = { startCall, answerCall, endCall };
