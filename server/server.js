const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["https://dodi-wine.vercel.app", "http://localhost:5173"], // Permitir ambos orígenes
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(compression());

const rooms = {};

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('createRoom', ({ videoUrl }) => {
    const roomId = uuidv4();
    rooms[roomId] = {
      videoState: {
        currentTime: 0,
        isPlaying: false,
        videoUrl: videoUrl,
      },
      users: [],
    };
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, videoUrl }); // Emitir el ID de la sala creada y la URL del video
    console.log(`Room created: ${roomId}`);
  });

  socket.on('joinRoom', ({ roomId, userId }) => {
    if (rooms[roomId]) {
      rooms[roomId].users.push(userId);
      socket.join(roomId);
      socket.to(roomId).emit('userJoined', userId);
      socket.emit('roomJoined', rooms[roomId].videoState);
      console.log(`User ${userId} joined room: ${roomId}`);
    } else {
      socket.emit('roomNotFound');
    }
  });

  socket.on('syncState', ({ roomId, videoState }) => {
    if (rooms[roomId] && rooms[roomId].videoState.currentTime !== videoState.currentTime) {
      rooms[roomId].videoState = videoState;
      io.to(roomId).emit('stateSynced', videoState);
      console.log(`Video state synced in room: ${roomId}`);
    }
  });

  socket.on('updateVideoUrl', ({ roomId, videoUrl }) => {
    if (rooms[roomId]) {
      rooms[roomId].videoState.videoUrl = videoUrl;
      io.to(roomId).emit('videoUrlUpdated', videoUrl);
      console.log(`Video URL updated in room: ${roomId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
