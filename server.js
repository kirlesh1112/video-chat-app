const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, "public")));

let waitingUsers = [];

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-queue", (data) => {

    // ✅ SAVE USER DATA SAFELY
    socket.userData = data;

    // ✅ REMOVE OLD ENTRY
    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);

    // =====================
    // SAME LANGUAGE MATCH
    // =====================
    let index = waitingUsers.findIndex(user =>
      user &&
      user.userData &&   // 🔥 FIX (IMPORTANT)
      user.userData.gender &&
      user.userData.language &&
      user.id !== socket.id &&
      user.userData.gender !== data.gender &&
      user.userData.language === data.language
    );

    if (index !== -1) {
      const partner = waitingUsers.splice(index, 1)[0];
      connectUsers(socket, partner);
      return;
    }

    // =====================
    // FALLBACK MATCH
    // =====================
    index = waitingUsers.findIndex(user =>
      user &&
      user.userData &&   // 🔥 FIX
      user.userData.gender &&
      user.id !== socket.id &&
      user.userData.gender !== data.gender
    );

    if (index !== -1) {
      const partner = waitingUsers.splice(index, 1)[0];

      socket.tempPartner = partner;
      partner.tempPartner = socket;

      socket.acceptedFallback = false;
      partner.acceptedFallback = false;

      socket.emit("fallback-match", partner.userData);
      partner.emit("fallback-match", socket.userData);

      return;
    }

    // =====================
    // WAIT
    // =====================
    waitingUsers.push(socket);
  });

  // =====================
  // FALLBACK RESPONSE
  // =====================
  socket.on("fallback-response", (accepted) => {
    const partner = socket.tempPartner;
    if (!partner) return;

    if (accepted && partner.acceptedFallback) {
      connectUsers(socket, partner);

      socket.tempPartner = null;
      partner.tempPartner = null;

    } else if (accepted) {
      socket.acceptedFallback = true;
    } else {
      waitingUsers.push(socket);
    }
  });

  // =====================
  // WEBRTC
  // =====================
  socket.on("webrtc-offer", ({ roomId, offer }) => {
    socket.to(roomId).emit("webrtc-offer", { offer });
  });

  socket.on("webrtc-answer", ({ roomId, answer }) => {
    socket.to(roomId).emit("webrtc-answer", { answer });
  });

  socket.on("webrtc-ice", ({ roomId, candidate }) => {
    socket.to(roomId).emit("webrtc-ice", { candidate });
  });

  // =====================
  // CHAT
  // =====================
  socket.on("chat-message", ({ roomId, message }) => {
    socket.to(roomId).emit("chat-message", message);
  });

  // =====================
  // NEXT USER
  // =====================
  socket.on("next-user", () => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit("partner-disconnected");
      socket.leave(socket.roomId);
    }

    socket.roomId = null;

    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
    waitingUsers.push(socket);
  });

  // =====================
  // DISCONNECT
  // =====================
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);

    if (socket.roomId) {
      socket.to(socket.roomId).emit("partner-disconnected");
    }
  });
});

// =====================
function connectUsers(user1, user2) {
  const roomId = user1.id + "#" + user2.id;

  user1.join(roomId);
  user2.join(roomId);

  user1.roomId = roomId;
  user2.roomId = roomId;

  user1.emit("matched", {
    roomId,
    partner: user2.userData
  });

  user2.emit("matched", {
    roomId,
    partner: user1.userData
  });
}

// =====================
server.listen(3000, () => {
  console.log("Server running on port 3000");
});