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
    origin: "*", // Permitir cualquier origen
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(compression());

const rooms = {};

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('createRoom', ({ videoUrl, host }) => {
    const roomId = uuidv4();
    rooms[roomId] = {
      videoState: {
        currentTime: 0,
        isPlaying: false,
        videoUrl: videoUrl,
      },
      users: [],
      host: socket.id, // Guardar el ID del socket del líder
    };
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, videoUrl, isHost: host }); // Emitir el ID de la sala creada, la URL del video y el estado del líder
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
    if (rooms[roomId] && rooms[roomId].host === socket.id) { // Solo el líder puede sincronizar el estado
      rooms[roomId].videoState = videoState;
      io.to(roomId).emit('stateSynced', videoState);
      console.log(`Video state synced in room: ${roomId}`);
    }
  });

  socket.on('updateVideoUrl', ({ roomId, videoUrl }) => {
    if (rooms[roomId] && rooms[roomId].host === socket.id) { // Solo el líder puede actualizar la URL del video
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
