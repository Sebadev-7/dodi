import React, { useState, useEffect, useRef } from 'react';
import { Video, Mic, Phone, Youtube, X, Play, Send, Power } from 'lucide-react';
import Peer from 'peerjs';
import ReactPlayer from 'react-player';
import socketIOClient from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { throttle } from 'lodash';

const ENDPOINT = 'https://dodi-16kt.onrender.com';
const socket = socketIOClient(ENDPOINT);

const VideoSyncApp = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shareCode, setShareCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [peer, setPeer] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [showRequest, setShowRequest] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoState, setVideoState] = useState({
    currentTime: 0,
    isPlaying: false,
    videoUrl: '',
  });
  const [roomCode, setRoomCode] = useState('');
  const [joinMessage, setJoinMessage] = useState('');
  const [isVideoChatActive, setIsVideoChatActive] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const peer = new Peer();
    peer.on('open', id => {
      setShareCode(id);
    });

    peer.on('call', call => {
      setIncomingCall(call);
      setShowRequest(true);
    });

    setPeer(peer);

    return () => {
      peer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (isVideoChatActive && localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      const audioTrack = localStream.getAudioTracks()[0];

      if (videoTrack) videoTrack.enabled = isCameraOn;
      if (audioTrack) audioTrack.enabled = isMicOn;

      if (peer && peer.connections[0]) {
        const call = peer.connections[0][0];
        call.peerConnection.getSenders().forEach(sender => {
          if (sender.track.kind === 'video') {
            sender.replaceTrack(videoTrack);
          } else if (sender.track.kind === 'audio') {
            sender.replaceTrack(audioTrack);
          }
        });
      }
    }
  }, [isCameraOn, isMicOn, localStream, peer, isVideoChatActive]);

  useEffect(() => {
    socket.on('stateSynced', (newVideoState) => {
      setVideoState(newVideoState);
      if (playerRef.current) {
        playerRef.current.seekTo(newVideoState.currentTime);
        if (newVideoState.isPlaying) {
          playerRef.current.getInternalPlayer().play();
        } else {
          playerRef.current.getInternalPlayer().pause();
        }
      }
    });

    socket.on('roomCreated', ({ roomId, videoUrl }) => {
      setRoomCode(roomId);
      setVideoUrl(videoUrl);
    });

    socket.on('userJoined', (userId) => {
      setJoinMessage(`Tu amiga ${userId} se unió a tu sala`);
    });

    socket.on('videoUrlUpdated', (videoUrl) => {
      setVideoUrl(videoUrl);
      setVideoState(prevState => ({
        ...prevState,
        videoUrl: videoUrl,
      }));
    });

    return () => {
      socket.off('stateSynced');
      socket.off('roomCreated');
      socket.off('userJoined');
      socket.off('videoUrlUpdated');
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (playerRef.current) {
        const newVideoState = {
          ...videoState,
          currentTime: playerRef.current.getCurrentTime(),
          isPlaying: !playerRef.current.getInternalPlayer().paused,
        };
        socket.emit('syncState', { roomId, videoState: newVideoState });
      }
    }, 10000); // Cada 10 segundos
    return () => clearInterval(interval);
  }, [videoState, roomId]);

  const handlePlayThrottled = throttle(() => {
    if (playerRef.current) {
      const newVideoState = {
        ...videoState,
        currentTime: playerRef.current.getCurrentTime(),
        isPlaying: true,
      };
      setVideoState(newVideoState);
      socket.emit('syncState', { roomId, videoState: newVideoState });
    }
  }, 1000); // Limita a una vez por segundo

  const handlePause = () => {
    if (playerRef.current) {
      const newVideoState = {
        ...videoState,
        currentTime: playerRef.current.getCurrentTime(),
        isPlaying: false,
      };
      setVideoState(newVideoState);
      socket.emit('syncState', { roomId, videoState: newVideoState });
    }
  };

  const handleSeek = (e) => {
    if (playerRef.current) {
      const newVideoState = {
        ...videoState,
        currentTime: e.target.currentTime,
        isPlaying: !playerRef.current.getInternalPlayer().paused,
      };
      setVideoState(newVideoState);
      socket.emit('syncState', { roomId, videoState: newVideoState });
    }
  };

  const handleFullscreenChange = (isFullscreen) => {
    setIsFullscreen(isFullscreen);
  };

  const initiateCall = () => {
    if (peer && inputCode) {
      const call = peer.call(inputCode, localStream);
      call.on('stream', stream => {
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      });
    }
  };

  const acceptCall = () => {
    if (incomingCall) {
      incomingCall.answer(localStream);
      incomingCall.on('stream', stream => {
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      });
      setShowRequest(false);
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      incomingCall.close();
      setShowRequest(false);
    }
  };

  const toggleCamera = () => {
    setIsCameraOn(prev => !prev);
  };

  const toggleMic = () => {
    setIsMicOn(prev => !prev);
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = !isMicOn;
    }
  };

  const reloadPage = () => {
    window.location.reload();
  };

  const createRoom = () => {
    socket.emit('createRoom', { videoUrl });
  };

  const joinRoom = () => {
    socket.emit('joinRoom', { roomId: inputCode, userId: 'user1' });
    socket.on('roomJoined', (videoState) => {
      setRoomId(inputCode);
      setVideoState(videoState);
      setVideoUrl(videoState.videoUrl);
    });
  };

  const updateVideoUrl = () => {
    socket.emit('updateVideoUrl', { roomId, videoUrl });
  };

  const startVideoChat = () => {
    setIsVideoChatActive(true);
    navigator.mediaDevices.getUserMedia({ video: isCameraOn, audio: false })
      .then(stream => {
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      })
      .catch(err => {
        console.error('Error accessing media devices.', err);
      });
  };

  const VideoControls = () => (
    <div className="flex justify-center items-center gap-6 p-2">
      <button
        className={`p-2 rounded-full transition-colors backdrop-blur-sm ${isCameraOn ? 'hover:bg-gray-700/50' : 'bg-red-600 hover:bg-red-700'}`}
        onClick={toggleCamera}
      >
        <Video className={`w-5 h-5 ${isCameraOn ? 'text-white' : 'text-red-600'}`} />
      </button>
      <button
        className={`p-2 rounded-full transition-colors backdrop-blur-sm ${isMicOn ? 'hover:bg-gray-700/50' : 'bg-red-600 hover:bg-red-700'}`}
        onClick={toggleMic}
      >
        <Mic className={`w-5 h-5 ${isMicOn ? 'text-white' : 'text-red-600'}`} />
      </button>
      <button
        className="p-2 bg-red-600 rounded-full hover:bg-red-700 transition-colors"
        onClick={reloadPage}
      >
        <Phone className="w-5 h-5 text-white" />
      </button>
      <button
        className="p-2 rounded-full hover:bg-gray-700/50 transition-colors backdrop-blur-sm"
        onClick={() => window.open('https://www.youtube.com', '_blank')}
      >
        <Youtube className="w-5 h-5 text-white" />
      </button>
      <button
        className={`p-2 rounded-full transition-colors backdrop-blur-sm ${isVideoChatActive ? 'bg-green-600 hover:bg-green-700' : 'hover:bg-gray-700/50'}`}
        onClick={startVideoChat}
      >
        <Power className={`w-5 h-5 ${isVideoChatActive ? 'text-green-600' : 'text-white'}`} />
      </button>
    </div>
  );

  const Footer = () => (
    <div className="text-center p-1 text-xs text-gray-400 bg-gray-900/50 backdrop-blur-sm">
      Hecho con amor por sebadev7
    </div>
  );

  return (
    <div className="h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-gray-900 text-white">
      <div className="h-full flex flex-col">
        {/* Barra superior */}
        <div className="bg-gray-900/50 backdrop-blur-sm p-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Play className="w-6 h-6 text-purple-400 fill-current" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 text-transparent bg-clip-text">
              DODI
            </h1>
          </div>
          <button className="p-2 hover:bg-gray-700/50 rounded-full backdrop-blur-sm">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenedor principal */}
        <div className={`flex-1 flex ${isMobile ? 'flex-col' : 'flex-row'} overflow-hidden`}>
          {/* Contenedor de video y chat */}
          <div className="flex-1 flex flex-col">
            {/* Video principal */}
            <div className={`relative bg-black/40 rounded-lg m-2 flex-shrink-0 ${isLandscape || isFullscreen ? 'h-full' : ''}`} style={{ height: isMobile && !isLandscape && !isFullscreen ? '35vh' : '75vh' }}>
              <div className="w-full h-full flex items-center justify-center">
                <ReactPlayer
                  ref={playerRef}
                  url={videoUrl}
                  playing={videoState.isPlaying}
                  controls
                  onPlay={handlePlayThrottled}
                  onPause={handlePause}
                  onSeek={handleSeek}
                  onFullscreenChange={handleFullscreenChange}
                  config={{
                    youtube: {
                      playerVars: {
                        modestbranding: 1,
                        autoplay: 0, // Desactivar el inicio automático
                        rel: 0,
                        iv_load_policy: 3,
                      },
                    },
                  }}
                  onBuffer={() => console.log('Buffering...')}
                  onBufferEnd={() => console.log('Buffering ended')}
                  width="100%"
                  height="100%"
                />
              </div>

              {/* Video chats flotantes (mobile) */}
              {isMobile && (
                <div className={`absolute ${isLandscape || isFullscreen ? 'bottom-4 left-4' : 'top-4 right-4'} flex flex-col gap-3`}>
                  <div className="w-14 h-14 rounded-full bg-gray-800/80 overflow-hidden border-2 border-purple-500 backdrop-blur-sm shadow-lg">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="w-14 h-14 rounded-full bg-gray-800/80 overflow-hidden border-2 border-blue-500 backdrop-blur-sm shadow-lg">
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}
            </div>

            {isMobile && (
              <div className="flex flex-col h-full">
                <VideoControls />
                <div className="flex-1 mx-2 flex flex-col">
                  {/* Cuadro para código compartido */}
                  <div className="mt-2">
                    <div className="bg-gray-800/40 p-2 rounded-lg text-center text-xs">
                      <p>Tu código para compartir: <span className="text-purple-400 font-semibold">{shareCode}</span></p>
                    </div>
                  </div>

                  {/* Caja para pegar código */}
                  <div className="mt-2">
                    <div className="bg-gray-800/30 p-2 rounded-lg flex items-center">
                      <input
                        type="text"
                        placeholder="Ingresa el código compartido..."
                        value={inputCode}
                        onChange={(e) => setInputCode(e.target.value)}
                        className="flex-1 bg-gray-700/50 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                      />
                      <button
                        className="ml-2 bg-purple-600 hover:bg-purple-700 px-3 py-1 text-xs rounded-lg"
                        onClick={initiateCall}
                      >
                        Conectar
                      </button>
                    </div>
                  </div>

                  {/* Campos y botones para crear y unirse a salas de video */}
                  <div className="mt-2">
                    <div className="bg-gray-800/30 p-2 rounded-lg flex flex-col">
                      <input
                        type="text"
                        placeholder="URL del video"
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        className="bg-gray-700/50 rounded-lg px-2 py-1 text-xs text-white focus:outline-none mb-2"
                      />
                      <button
                        className="bg-purple-600 hover:bg-purple-700 px-3 py-1 text-xs rounded-lg mb-2"
                        onClick={createRoom}
                      >
                        Crear Sala
                      </button>
                      {roomCode && (
                        <div className="text-purple-400 font-semibold mb-2">
                          Código de la sala: {roomCode}
                        </div>
                      )}
                      <input
                        type="text"
                        placeholder="Código de la sala"
                        value={inputCode}
                        onChange={(e) => setInputCode(e.target.value)}
                        className="bg-gray-700/50 rounded-lg px-2 py-1 text-xs text-white focus:outline-none mb-2"
                      />
                      <button
                        className="bg-purple-600 hover:bg-purple-700 px-3 py-1 text-xs rounded-lg"
                        onClick={joinRoom}
                      >
                        Unirse a Sala
                      </button>
                      <button
                        className="bg-purple-600 hover:bg-purple-700 px-3 py-1 text-xs rounded-lg mt-2"
                        onClick={updateVideoUrl}
                      >
                        Ver juntos
                      </button>
                    </div>
                  </div>

                  {/* Mensaje de unión a la sala */}
                  {joinMessage && (
                    <div className="mt-2 bg-gray-800/30 p-2 rounded-lg text-center text-xs">
                      <p>{joinMessage}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {!isMobile && (
            <div className="w-96 flex flex-col bg-gray-800/30 backdrop-blur-sm p-3 m-2 rounded-lg overflow-y-auto">
              <div className="space-y-3 mb-3">
                <div className="w-full h-48 bg-gray-700/50 rounded-lg overflow-hidden shadow-lg border border-purple-500/30">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="w-full h-48 bg-gray-700/50 rounded-lg overflow-hidden shadow-lg border border-blue-500/30">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              {/* Cuadro para código compartido */}
              <div className="mt-2">
                <div className="bg-gray-800/40 p-2 rounded-lg text-center text-xs">
                  <p>Tu código para compartir: <span className="text-purple-400 font-semibold">{shareCode}</span></p>
                </div>
              </div>
              {/* Caja para pegar código */}
              <div className="mt-2">
                <div className="bg-gray-800/30 p-2 rounded-lg flex items-center">
                  <input
                    type="text"
                    placeholder="Ingresa el código compartido..."
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    className="flex-1 bg-gray-700/50 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                  />
                  <button
                    className="ml-2 bg-purple-600 hover:bg-purple-700 px-3 py-1 text-xs rounded-lg"
                    onClick={initiateCall}
                  >
                    Conectar
                  </button>
                </div>
              </div>

              {/* Campos y botones para crear y unirse a salas de video */}
              <div className="mt-2">
                <div className="bg-gray-800/30 p-2 rounded-lg flex flex-col">
                  <input
                    type="text"
                    placeholder="URL del video"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className="bg-gray-700/50 rounded-lg px-2 py-1 text-xs text-white focus:outline-none mb-2"
                  />
                  <button
                    className="bg-purple-600 hover:bg-purple-700 px-3 py-1 text-xs rounded-lg mb-2"
                    onClick={createRoom}
                  >
                    Crear Sala
                  </button>
                  {roomCode && (
                    <div className="text-purple-400 font-semibold mb-2">
                      Código de la sala: {roomCode}
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder="Código de la sala"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    className="bg-gray-700/50 rounded-lg px-2 py-1 text-xs text-white focus:outline-none mb-2"
                  />
                  <button
                    className="bg-purple-600 hover:bg-purple-700 px-3 py-1 text-xs rounded-lg"
                    onClick={joinRoom}
                  >
                    Unirse a Sala
                  </button>
                  <button
                    className="bg-purple-600 hover:bg-purple-700 px-3 py-1 text-xs rounded-lg mt-2"
                    onClick={updateVideoUrl}
                  >
                    Ver juntos
                  </button>
                </div>
              </div>

              {/* Mensaje de unión a la sala */}
              {joinMessage && (
                <div className="mt-2 bg-gray-800/30 p-2 rounded-lg text-center text-xs">
                  <p>{joinMessage}</p>
                </div>
              )}
            </div>
          )}
        </div>
        {!isMobile && <VideoControls />}
        <Footer />
      </div>
      {showRequest && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-gray-800 p-4 rounded-lg text-center">
            <p className="text-white">¡Te quieren ver!</p>
            <div className="flex justify-center mt-4">
              <button
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg mr-2"
                onClick={acceptCall}
              >
                Aceptar
              </button>
              <button
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg"
                onClick={rejectCall}
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoSyncApp;
