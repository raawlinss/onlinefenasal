// Sadə Socket.IO serveri: hamı eyni otaqda, hər maşının mövqeyi paylaşılıb

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const bannedWords = require('./bannedWords');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.static(path.join(__dirname)));

// Bütün oyunçular üçün vahid state
// id -> { id, name, laneIndex, direction }
const players = {};

// Game state
let gameState = 'WAITING'; // WAITING, COUNTDOWN, RACING
let countdown = 10;
let countdownTimer = null;

// Lap winner tracking
let firstLap1Winner = null; // { id, name }
let raceWinner = null;      // first to finish lap 5
let firstLapWinners = { 1: null, 2: null, 3: null, 4: null, 5: null }; // lap -> { id, name }

let chatDisabled = false;
let chatSlowModeSeconds = 0;
const chatMessages = [];
const lastChatSentAt = {}; // socketId -> ms
let nickBlurEnabled = false; // Raawlinns'in açıp kapattığı global nick blur durumu

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const bannedPattern = new RegExp(
  bannedWords
    .map((w) => String(w || '').trim())
    .filter((w, idx, arr) => w && arr.indexOf(w) === idx)
    .map(escapeRegex)
    .join('|'),
  'i'
);

function containsBannedWord(str) {
  const text = String(str || '');
  const hit = bannedPattern.test(text);
  if (hit) {
    console.log('Yasaklı kelime tespit edildi, içinde:', text);
    return true;
  }
  return false;
}

function isNicknameAllowed(name) {
  return !containsBannedWord(name);
}

function isChatTextAllowed(text) {
  return !containsBannedWord(text);
}

const laneOffsets = [0, 1, 2, 3];

function nextLaneIndex() {
  const used = new Set(Object.values(players).map((p) => p.laneIndex));
  for (let i = 0; i < laneOffsets.length; i++) {
    if (!used.has(i)) return i;
  }
  return Math.floor(Math.random() * 4);
}

const MAX_PLAYERS = 60;

io.on('connection', (socket) => {
  const id = socket.id;

  socket.on('join', (payload) => {
    if (Object.keys(players).length >= MAX_PLAYERS) {
        socket.emit('error', { message: 'Sunucu dolu (Maks 60 kişi)!' });
        return;
    }

    let name = (payload && typeof payload.name === 'string' ? payload.name.trim() : '') || 'Guest';
    // Nickname limit 12
    if (name.length > 12) name = name.substring(0, 12);

    if (!isNicknameAllowed(name)) {
      socket.emit('error', { message: 'Bu takma ad kullanılamaz.' });
      return;
    }

    // Nick tekilliği: aynı anda aynı isim sadece bir kişide olsun
    const nameInUse = Object.values(players).some(
      (p) => p && typeof p.name === 'string' && p.name === name
    );
    if (nameInUse) {
      socket.emit('error', { message: 'Bu takma ad şu anda kullanılıyor. Lütfen başka bir nick dene.' });
      return;
    }

    // Raawlinns için şifre zorunlu
    if (name === 'Raawlinns') {
      const password = payload && typeof payload.password === 'string' ? payload.password : '';
      if (password !== 'naberlansaban') {
        socket.emit('error', { message: 'Raawlinns nicki için doğru şifre gerekli.' });
        return;
      }
    }

    const laneIndex = nextLaneIndex();

    // 0..5 arası random araba sprite index-i (cars.png..cars6.png)
    const carSpriteIndex = Math.floor(Math.random() * 6);

    const ua = String((socket.handshake && socket.handshake.headers && socket.handshake.headers['user-agent']) || '').toLowerCase();
    const uaMobile = /android|iphone|ipad|ipod|mobile/.test(ua);
    const isMobile = !!(payload && payload.mobile) || uaMobile;
    const displayName = isMobile ? `${name} 📱` : name;

    players[id] = {
      id,
      name,
      displayName,
      isMobile,
      laneIndex,
      lap: 0,
      direction: 0,
      distance: 0,
      speed: 0,
      nitroActive: false,
      playerX: 0,
      carSpriteIndex,
    };

    socket.emit('chatInit', {
      disabled: chatDisabled,
      slowModeSeconds: chatSlowModeSeconds,
      history: chatMessages,
    });

  // Sadece Raawlinns: oyuncu nick blur durumunu global değiştir
  socket.on('nickBlurUpdate', (payload) => {
    const p = players[id];
    if (!p) return;
    if (p.name !== 'Raawlinns') return;

    const enabled = !!(payload && payload.enabled);
    nickBlurEnabled = enabled;
    io.emit('nickBlurState', { enabled: nickBlurEnabled });
  });

    socket.emit('welcome', { id, players, gameState, countdown, nickBlurEnabled });
    // Yeni bağlanan client, mevcut blur durumunu da alsın
    socket.emit('nickBlurState', { enabled: nickBlurEnabled });
    io.emit('state', players);
  });

  socket.on('chatSend', (payload) => {
    const p = players[id];
    if (!p) return;
    if (chatDisabled) {
      socket.emit('chatError', { message: 'Sohbet şu an kapalı.' });
      return;
    }

    const now = Date.now();
    const lastAt = lastChatSentAt[id] || 0;
    const diff = now - lastAt;
    if (chatSlowModeSeconds > 0 && diff < chatSlowModeSeconds * 1000) {
      const wait = Math.ceil((chatSlowModeSeconds * 1000 - diff) / 1000);
      socket.emit('chatError', { message: `Slow mode açık. ${wait}s bekle.` });
      return;
    }

    let text = (payload && typeof payload.text === 'string' ? payload.text : '').trim();
    if (!text) return;
    if (text.length > 140) text = text.substring(0, 140);

    if (!isChatTextAllowed(text)) {
      socket.emit('chatError', { message: 'Bu mesajda izin verilmeyen ifadeler var.' });
      return;
    }

    const msg = {
      id: `${now}-${Math.floor(Math.random() * 1e9)}`,
      name: p.name,
      isMobile: !!p.isMobile,
      text,
      ts: now,
      type: 'user',
    };

    chatMessages.push(msg);
    while (chatMessages.length > 200) chatMessages.shift();
    lastChatSentAt[id] = now;
    io.emit('chatMessage', msg);
  });

  socket.on('chatDelete', (payload) => {
    const p = players[id];
    if (!p || p.name !== 'Raawlinns') return;
    const msgId = payload && typeof payload.id === 'string' ? payload.id : '';
    if (!msgId) return;

    const idx = chatMessages.findIndex((m) => m && m.id === msgId);
    if (idx < 0) return;
    chatMessages.splice(idx, 1);
    io.emit('chatDeleted', { id: msgId, by: p.name, ts: Date.now() });
    io.emit('chatSystem', { text: 'Admin bir mesajı sildi.', ts: Date.now() });
  });

  socket.on('chatAdminUpdate', (payload) => {
    const p = players[id];
    if (!p || p.name !== 'Raawlinns') return;

    const nextSlow = payload && typeof payload.slowModeSeconds === 'number' ? payload.slowModeSeconds : chatSlowModeSeconds;
    const nextDisabled = payload && typeof payload.disabled === 'boolean' ? payload.disabled : chatDisabled;

    const allowed = new Set([0, 1, 3, 5, 10]);
    if (!allowed.has(nextSlow)) return;

    chatSlowModeSeconds = nextSlow;
    chatDisabled = nextDisabled;

    io.emit('chatSettings', { disabled: chatDisabled, slowModeSeconds: chatSlowModeSeconds, ts: Date.now() });

    const slowText = chatSlowModeSeconds > 0 ? `${chatSlowModeSeconds}s` : 'Kapalı';
    const disabledText = chatDisabled ? 'Açık' : 'Kapalı';
    io.emit('chatSystem', { text: `Admin ayarları güncelledi. Slow mode: ${slowText}. Sohbeti kapat: ${disabledText}.`, ts: Date.now() });
  });
  
  // Admin Kick Event
  socket.on('kickPlayer', (targetId) => {
      const admin = players[id];
      if (admin && admin.name === 'Raawlinns') {
          if (players[targetId]) {
              io.to(targetId).emit('kicked'); // Tell client they are kicked
              io.sockets.sockets.get(targetId)?.disconnect(true); // Force disconnect
              delete players[targetId];
              io.emit('state', players);
          }
      }
  });

  socket.on('updateState', (data) => {
    const p = players[id];
    if (!p) return;

    if (typeof data.direction === 'number') p.direction = data.direction;
    if (typeof data.distance === 'number') p.distance = data.distance;
    if (typeof data.lap === 'number') p.lap = data.lap;
    if (typeof data.speed === 'number') p.speed = data.speed;
    if (typeof data.nitroActive === 'boolean') p.nitroActive = data.nitroActive;
    if (typeof data.playerX === 'number') p.playerX = data.playerX;
    
    socket.broadcast.emit('playerUpdated', p);
  });

  // Client (mobil) kendini işaretlerse: ismini server tarafında rename et
  socket.on('markMobile', () => {
    const p = players[id];
    if (!p) return;
    p.isMobile = true;
    if (typeof p.name === 'string' && !/📱$/.test(p.name)) {
      p.name = `${p.name} 📱`;
    }
    io.emit('state', players);
  });
  
  // Client notifies when it completes a lap
  socket.on('lapCompleted', (payload) => {
    const p = players[id];
    if (!p || !payload || typeof payload.lap !== 'number') return;
    const lap = payload.lap | 0;

    // First to complete each lap 1..5
    if (lap >= 1 && lap <= 5 && !firstLapWinners[lap]) {
      firstLapWinners[lap] = { id, name: p.name };
      io.emit('gameUpdate', { type: 'LAP_WINNER', lap, id, name: p.name });
    }

    // First to complete lap 1
    if (lap === 1 && !firstLap1Winner) {
      firstLap1Winner = { id, name: p.name };
      io.emit('gameUpdate', { type: 'LAP1_WINNER', id, name: p.name });
    }

    // First to complete lap 5 (race winner)
    if (lap === 5 && !raceWinner) {
      raceWinner = { id, name: p.name };
      io.emit('gameUpdate', { type: 'RACE_WINNER', id, name: p.name });
    }
  });

  // Admin start game
  socket.on('startGame', () => {
    // Only allow if specific nickname (though basic check here, better security needed in prod)
    const p = players[id];
    if (p && p.name === 'Raawlinns' && gameState !== 'COUNTDOWN') {
        startCountdown();
    }
  });

  socket.on('disconnect', () => {
    delete players[id];
    delete lastChatSentAt[id];
    io.emit('state', players);
  });
});

function startCountdown() {
    gameState = 'COUNTDOWN';
    countdown = 10;
    // Reset lap winners for new race
    firstLap1Winner = null;
    raceWinner = null;
    firstLapWinners = { 1: null, 2: null, 3: null, 4: null, 5: null };
    
    // Reset players and assign lanes (spawn pozisyonuna teleport)
    const playerIds = Object.keys(players);
    playerIds.forEach((pid, index) => {
        const p = players[pid];
        p.distance = 0;
        p.speed = 0;
        p.direction = 0;
        p.lap = 0;
        p.laneIndex = index % 4; // 0, 1, 2, 3 lanes
        // Lane indeksine görə x-pozisyonu (clientdəki kimi) ver ki, hamı start xəttinə toplansın
        const laneOffsets = [-0.6, -0.2, 0.2, 0.6];
        p.playerX = laneOffsets[p.laneIndex];
        // Reset local physics state if needed (client handles this based on reset)
    });
    
    io.emit('gameUpdate', { type: 'RESET_POSITIONS', players });
    io.emit('gameUpdate', { type: 'STATE_CHANGE', state: gameState });
    
    if (countdownTimer) clearInterval(countdownTimer);
    
    countdownTimer = setInterval(() => {
        countdown--;
        io.emit('gameUpdate', { type: 'COUNTDOWN', value: countdown });
        
        if (countdown <= 0) {
            clearInterval(countdownTimer);
            gameState = 'RACING';
            io.emit('gameUpdate', { type: 'STATE_CHANGE', state: gameState });
        }
    }, 1000);
}

server.listen(PORT, HOST, () => {
  console.log(`Server http://${HOST}:${PORT} ünvanında işə düşdü`);
});
