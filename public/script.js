const socket = io();

let localStream;
let peerConnection;
let currentRoomId = null;

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("partnerVideo");

// SCREENS
const entryScreen = document.getElementById("entry-screen");
const waitingScreen = document.getElementById("waiting-screen");
const chatScreen = document.getElementById("chat-screen");

// ICE SERVERS (UPGRADED)
const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ]
};

// =====================
// START BUTTON
// =====================
document.getElementById("startBtn").onclick = async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value;
  const gender = document.getElementById("gender").value;
  const language = document.getElementById("language").value;

  if (!name || !gender || !language) {
    alert("Fill all details");
    return;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localVideo.srcObject = localStream;
  } catch (err) {
    alert("Camera/Mic permission denied");
    return;
  }

  entryScreen.classList.remove("active");
  waitingScreen.classList.add("active");

  socket.emit("join-queue", { name, gender, language });
};

// =====================
// CREATE PEER
// =====================
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(config);

  // ADD TRACKS
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // REMOTE VIDEO
  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  // ICE
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("webrtc-ice", {
        roomId: currentRoomId,
        candidate: event.candidate
      });
    }
  };

  // 🔥 CONNECTION STATE DEBUG (IMPORTANT)
  peerConnection.onconnectionstatechange = () => {
    console.log("Connection state:", peerConnection.connectionState);

    if (peerConnection.connectionState === "failed") {
      console.log("Retrying connection...");
    }
  };
}

// =====================
// MATCHED
// =====================
socket.on("matched", async ({ roomId, partner }) => {
  currentRoomId = roomId;

  waitingScreen.classList.remove("active");
  chatScreen.classList.add("active");

  document.getElementById("partnerName").innerText = partner.name;

  createPeerConnection();

  const isCaller = socket.id === roomId.split("#")[0];

  if (isCaller) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit("webrtc-offer", { roomId, offer });
  }
});

// =====================
// OFFER
// =====================
socket.on("webrtc-offer", async ({ offer }) => {
  if (!peerConnection) createPeerConnection();

  await peerConnection.setRemoteDescription(offer);

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("webrtc-answer", {
    roomId: currentRoomId,
    answer
  });
});

// =====================
// ANSWER
// =====================
socket.on("webrtc-answer", async ({ answer }) => {
  if (!peerConnection) return;

  if (peerConnection.signalingState !== "have-local-offer") return;

  await peerConnection.setRemoteDescription(answer);
});

// =====================
// ICE
// =====================
socket.on("webrtc-ice", async ({ candidate }) => {
  if (!peerConnection) return;

  try {
    await peerConnection.addIceCandidate(candidate);
  } catch (e) {
    console.log("ICE error:", e);
  }
});

// =====================
// FALLBACK
// =====================
socket.on("fallback-match", (partner) => {
  const ok = confirm(
    `No same language user found.\nConnect with ${partner.language} ${partner.gender}?`
  );

  socket.emit("fallback-response", ok);
});

// =====================
// CLEANUP FUNCTION 🔥
// =====================
function cleanupConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach(track => track.stop());
  }

  remoteVideo.srcObject = null;
}

// =====================
// PARTNER DISCONNECTED
// =====================
socket.on("partner-disconnected", () => {
  console.log("Partner disconnected");

  cleanupConnection();

  document.getElementById("chatMessages").innerHTML = "";

  chatScreen.classList.remove("active");
  waitingScreen.classList.add("active");

  // AUTO REJOIN
  socket.emit("join-queue", {
    name: document.getElementById("name").value,
    gender: document.getElementById("gender").value,
    language: document.getElementById("language").value
  });
});

// =====================
// CHAT
// =====================
const sendBtn = document.getElementById("sendBtn");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");

sendBtn.onclick = () => {
  const message = chatInput.value.trim();
  if (!message) return;

  const div = document.createElement("div");
  div.innerText = "You: " + message;
  chatMessages.appendChild(div);

  socket.emit("chat-message", {
    roomId: currentRoomId,
    message
  });

  chatInput.value = "";
};

socket.on("chat-message", (message) => {
  const div = document.createElement("div");
  div.innerText = "Partner: " + message;
  chatMessages.appendChild(div);
});

// =====================
// NEXT BUTTON
// =====================
document.getElementById("nextBtn").onclick = () => {
  if (!currentRoomId) return;

  socket.emit("next-user");

  cleanupConnection();

  chatMessages.innerHTML = "";

  chatScreen.classList.remove("active");
  waitingScreen.classList.add("active");
};

// =====================
// REPORT
// =====================
document.getElementById("reportBtn").onclick = () => {
  socket.emit("report-user");
  alert("User reported successfully");
};

// =====================
// MUTE
// =====================
let isMuted = false;

document.getElementById("muteBtn").onclick = () => {
  if (!localStream) return;

  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;

  isMuted = !isMuted;
  audioTrack.enabled = !isMuted;

  document.getElementById("muteBtn").innerText = isMuted ? "Unmute" : "Mute";
};