// RetroRaceArcade stilinde, online destekli JS/canvas oyunu

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const volumeSlider = document.getElementById('volume-slider');
const volumeValue = document.getElementById('volume-value');
const nextTrackBtn = document.getElementById('next-track-btn');
const trackInfo = document.getElementById('track-info');

const chatPanel = document.getElementById('chat-panel');
const chatStatusEl = document.getElementById('chat-status');
const chatAdminControlsEl = document.getElementById('chat-admin-controls');
const chatSlowModeSelect = document.getElementById('chat-slowmode');
const chatDisableToggle = document.getElementById('chat-disable');
const chatMessagesEl = document.getElementById('chat-messages');
const chatInputEl = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send');

const mobileControlsEl = document.getElementById('mobile-controls');
const btnUp = document.getElementById('btn-up');
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnNitro = document.getElementById('btn-nitro');

let chatDisabled = false;
let chatSlowModeSeconds = 0;
let chatUiBound = false;

function isMobileDevice() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 900;
  const ua = (navigator && navigator.userAgent ? navigator.userAgent : '').toLowerCase();
  const uaMobile = /android|iphone|ipad|ipod|mobile/.test(ua);
  return (coarse && small) || uaMobile;
}

const IS_MOBILE = isMobileDevice();

function bindTouchButton(el, keyName) {
  if (!el) return;
  const down = (e) => {
    e.preventDefault();
    if (keys && keyName in keys) keys[keyName] = true;
  };
  const up = (e) => {
    e.preventDefault();
    if (keys && keyName in keys) keys[keyName] = false;
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
}

function updateMobileOrientationClass() {
  if (!IS_MOBILE) return;
  document.body.classList.toggle('is-landscape', (window.innerWidth || 0) > (window.innerHeight || 0));
}

function resizeCanvasForMobile() {
  if (!IS_MOBILE || !canvas) return;

  const baseAspect = 960 / 600;
  const vw = (window.visualViewport && window.visualViewport.width) ? window.visualViewport.width : (window.innerWidth || canvas.width);
  const vh = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : (window.innerHeight || canvas.height);

  const controlsH = mobileControlsEl ? Math.ceil(mobileControlsEl.getBoundingClientRect().height) : 0;
  const safeMargin = 16;
  const reserved = Math.max(controlsH + safeMargin, 140);
  const availableH = Math.max(160, vh - reserved);

  let targetW = vw;
  let targetH = targetW / baseAspect;

  if (targetH > availableH) {
    targetH = availableH;
    targetW = targetH * baseAspect;
  }

  canvas.style.width = `${Math.floor(targetW)}px`;
  canvas.style.height = `${Math.floor(targetH)}px`;
}

const bgTracks = [
  new Audio('/Sesler/Ana%20ses1.mp3'),
  new Audio('/Sesler/Ana%20ses2.mp3'),
  new Audio('/Sesler/Ana%20ses3.mp3'),
];
let bgTrackIndex = Math.floor(Math.random() * bgTracks.length);

function getBgTrackLabel(idx) {
  return `Ana ses${idx + 1}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatChatTime(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function scrollChatToBottom() {
  if (!chatMessagesEl) return;
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function setChatUiEnabled(enabled) {
  if (chatInputEl) chatInputEl.disabled = !enabled;
  if (chatSendBtn) chatSendBtn.disabled = !enabled;
}

function updateChatStatus() {
  if (!chatStatusEl) return;
  const parts = [];
  parts.push(chatDisabled ? 'Kapalı' : 'Açık');
  if (chatSlowModeSeconds > 0) parts.push(`Slow: ${chatSlowModeSeconds}s`);
  chatStatusEl.textContent = parts.join(' | ');
  setChatUiEnabled(!chatDisabled);
}

function renderChatMessage(msg) {
  if (!chatMessagesEl || !msg) return;
  const li = document.createElement('li');
  li.className = 'chat-msg';
  li.dataset.id = msg.id;

  if (msg.type === 'system') {
    li.classList.add('chat-system');
  }

  const meta = document.createElement('div');
  meta.className = 'meta';
  if (msg.type === 'system') {
    meta.textContent = `[${formatChatTime(msg.ts)}] Sistem`;
  } else {
    const nameEl = document.createElement('strong');
    const baseName = msg.name || 'Sistem';
    const displayName = msg && msg.type === 'user' && msg.isMobile ? `${baseName} 📱` : baseName;
    nameEl.textContent = displayName;
    meta.appendChild(nameEl);
  }

  const text = document.createElement('div');
  text.className = 'text';
  text.textContent = msg.text;

  li.appendChild(meta);
  li.appendChild(text);

  if (myName === 'Raawlinns' && msg.type !== 'system') {
    li.classList.add('chat-deletable');
    li.addEventListener('click', () => {
      if (!socket || !socket.connected) return;
      const mid = li.dataset.id;
      if (!mid) return;
      socket.emit('chatDelete', { id: mid });
    });
  }

  chatMessagesEl.appendChild(li);
  scrollChatToBottom();
}

function removeChatMessageById(id) {
  if (!chatMessagesEl) return;
  const el = chatMessagesEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (el) el.remove();
}

function formatSeconds(s) {
  if (!Number.isFinite(s)) return '0';
  return String(Math.max(0, Math.floor(s)));
}

function updateTrackInfo() {
  if (!trackInfo) return;
  const a = bgTracks[bgTrackIndex];
  if (!a) {
    trackInfo.textContent = '';
    return;
  }

  const cur = formatSeconds(a.currentTime);
  const dur = Number.isFinite(a.duration) ? formatSeconds(a.duration) : '?';
  trackInfo.textContent = `${getBgTrackLabel(bgTrackIndex)}  ${cur}s / ${dur}s`;
}

let bgVolume = 0.25;
let userBgVolume = 0.25;
function applyBgVolume() {
  bgTracks.forEach((a) => {
    a.volume = bgVolume;
  });
}

function pauseAllBgTracks() {
  bgTracks.forEach((t) => {
    if (!t) return;
    t.pause();
  });
}

function nextBgTrack() {
  if (!bgTracks.length) return;
  pauseAllBgTracks();
  bgTrackIndex = (bgTrackIndex + 1) % bgTracks.length;
  startBgMusic();
  updateTrackInfo();
}

const sfxTracks = [
  new Audio('/Sesler/rastgele1.mp3'),
  new Audio('/Sesler/rastgele2.mp3'),
  new Audio('/Sesler/rastgele3.mp3'),
  new Audio('/Sesler/rastgele4.mp3'),
];

let sfxTimer = null;
let sfxPlaying = false;
let lastSfxIdx = -1;
let lastSfxStreak = 0;

function restoreBgToUserVolume() {
  bgVolume = userBgVolume;
  applyBgVolume();
}

function duckBgForSfx() {
  bgVolume = 0.01;
  applyBgVolume();
}

function pickRandomSfxIndex() {
  if (!sfxTracks.length) return -1;
  if (sfxTracks.length === 1) return 0;

  // Prevent the same SFX from playing more than 2 times in a row
  const mustAvoidLast = lastSfxStreak >= 2 && lastSfxIdx >= 0;

  let idx = Math.floor(Math.random() * sfxTracks.length);
  if (mustAvoidLast) {
    let guard = 0;
    while (idx === lastSfxIdx && guard < 25) {
      idx = Math.floor(Math.random() * sfxTracks.length);
      guard += 1;
    }
  }

  if (idx === lastSfxIdx) {
    lastSfxStreak += 1;
  } else {
    lastSfxIdx = idx;
    lastSfxStreak = 1;
  }

  return idx;
}

function playRandomSfx() {
  if (sfxPlaying) return;
  if (!sfxTracks.length) return;

  const idx = pickRandomSfxIndex();
  if (idx < 0) return;
  const a = sfxTracks[idx];
  if (!a) return;

  sfxPlaying = true;

  // Duck main music to 5% while SFX is playing
  duckBgForSfx();

  a.currentTime = 0;
  a.volume = 1.0;
  a.play().catch(() => {
    // Autoplay blocked - restore
    sfxPlaying = false;
    restoreBgToUserVolume();
  });

  a.onended = () => {
    a.onended = null;
    sfxPlaying = false;
    restoreBgToUserVolume();
  };
}

function startSfxLoop() {
  if (sfxTimer) return;
  sfxTimer = setInterval(() => {
    if (gameState !== 'RACING') return;
    // Every 20 seconds, allow at most 1 SFX to start. If one is already playing, skip this tick.
    if (sfxPlaying) return;
    playRandomSfx();
  }, 20000);
}

function stopSfxLoop() {
  if (sfxTimer) {
    clearInterval(sfxTimer);
    sfxTimer = null;
  }
}

function startBgMusic() {
  const a = bgTracks[bgTrackIndex];
  if (!a) return;
  a.currentTime = 0;
  a.play().catch(() => {
    const resume = () => {
      window.removeEventListener('keydown', resume);
      window.removeEventListener('pointerdown', resume);
      startBgMusic();
    };
    window.addEventListener('keydown', resume, { once: true });
    window.addEventListener('pointerdown', resume, { once: true });
  });
}

bgTracks.forEach((a) => {
  a.addEventListener('ended', () => {
    bgTrackIndex = (bgTrackIndex + 1) % bgTracks.length;
    startBgMusic();
    updateTrackInfo();
  });
});

if (volumeSlider) {
  const initial = Number(volumeSlider.value);
  if (!Number.isNaN(initial)) {
    userBgVolume = Math.max(0, Math.min(1, initial / 100));
    bgVolume = userBgVolume;
  }
  if (volumeValue) volumeValue.textContent = `${Math.round(bgVolume * 100)}%`;
  applyBgVolume();

  updateTrackInfo();

  volumeSlider.addEventListener('input', () => {
    const v = Number(volumeSlider.value);
    userBgVolume = Math.max(0, Math.min(1, (Number.isNaN(v) ? 25 : v) / 100));
    if (volumeValue) volumeValue.textContent = `${Math.round(userBgVolume * 100)}%`;
    if (!sfxPlaying) {
      bgVolume = userBgVolume;
      applyBgVolume();
    }
  });
} else {
  userBgVolume = bgVolume;
  applyBgVolume();
}

if (nextTrackBtn) {
  nextTrackBtn.addEventListener('click', () => {
    nextBgTrack();
  });
}

startBgMusic();

setInterval(() => {
  updateTrackInfo();
}, 500);

// Sprite sheets: cars*.png (her biri 3 kadr: düz, sağ, sol)
const carSpriteImages = [];
const CAR_SPRITE_SOURCE_WIDTH = 84;
const CAR_SPRITE_SOURCE_HEIGHT = 36;

['cars.png', 'cars2.png', 'cars3.png', 'cars4.png', 'cars5.png', 'cars6.png'].forEach((file) => {
  const img = new Image();
  img.src = `RetroRaceArcade_Qt-Cpp-master/res/${file}`;
  carSpriteImages.push(img);
});

// Ekran ölçüləri (Qt-utils ilə eyni məntiqlə)
const LOGICAL_WIDTH = 160;
const LOGICAL_HEIGHT = 100;
const CELL_SIZE = 6; // 160x100 * 6 = 960x600

// Multiplayer state
let socket = null;
let myId = null;
let myName = '';
let players = {}; // id -> { id, name, laneIndex, direction }
let gameState = 'WAITING'; // WAITING, COUNTDOWN, RACING
let countdownVal = 0;

// Oyun state-i (C++ GameScene dəyişənlərinin JS portu)
let distance = 0.0;          // m_distance
let curvature = 0.0;         // m_curvature (target track curvaturee doğru interpolasiya)
let trackCurvature = 0.0;    // m_trackCurvature (yığılan track əyriliyi)
let trackDistance = 0.0;     // m_trackDistance (tam dairə uzunluğu)
let carPos = 0.0;            // m_carPos: ekranda sağ/sol (-1..1)
let playerX = 0.0;           // Multiplayer üçün serverə göndərilən yan pozisiya
let playerCurvature = 0.0;   // m_playerCurvature: oyunçunun yığılmış dönməsi
let speed = 0.0;             // m_speed (0..1 arası)
let carDirection = 0;        // -1 sol, 0 düz, +1 sağ

// Nitro sistemi
let nitroActive = false;
let nitroCharge = 100.0; // 0-100
let nitroCooldownTimer = 0.0; // Saniye
const NITRO_MAX_DURATION = 3.0; // Nitro aktif kaldığı toplam süre (~3s)
const NITRO_RECHARGE_TIME = 15.0; // 0'dan 100'e dolma süresi (~15s)
const NITRO_SPEED_MULTIPLIER = 1.12; // Nitro aktiv olanda real sürətə +12%

let nitroBoostFactor = 1.0;

let currentLapTime = 0.0;
let lapTimes = [0, 0, 0, 0, 0];

// Lap & winner HUD state
let currentLap = 0; // 0-dan başlayır, hər trackDistance keçəndə +1
let lap1WinnerName = '';
let lap1WinnerTimer = 0; // saniyə
let raceWinnerName = '';
let raceWinnerTimer = 0; // saniyə

let lapWinners = { 1: '', 2: '', 3: '', 4: '', 5: '' };
let lapWinnerOverlayText = '';
let lapWinnerOverlayTimer = 0;

let skidMarks = [];

let lastStateSentAt = 0;
const STATE_SEND_INTERVAL_MS = 50;

// Input
const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  ' ': false // Nitro (Space)
};

function initMobileLayoutIfNeeded() {
  if (!IS_MOBILE) return;
  document.body.classList.add('is-mobile');
  updateMobileOrientationClass();
  if (mobileControlsEl) mobileControlsEl.classList.remove('hidden');
  bindTouchButton(btnUp, 'w');
  bindTouchButton(btnLeft, 'a');
  bindTouchButton(btnRight, 'd');
  bindTouchButton(btnNitro, ' ');

  resizeCanvasForMobile();
}

initMobileLayoutIfNeeded();
window.addEventListener('resize', () => {
  initMobileLayoutIfNeeded();
  updateMobileOrientationClass();
  resizeCanvasForMobile();
});
window.addEventListener('orientationchange', () => {
  initMobileLayoutIfNeeded();
  updateMobileOrientationClass();
  resizeCanvasForMobile();
});
window.addEventListener('load', () => {
  initMobileLayoutIfNeeded();
  updateMobileOrientationClass();
  resizeCanvasForMobile();
  setTimeout(() => {
    initMobileLayoutIfNeeded();
    updateMobileOrientationClass();
    resizeCanvasForMobile();
  }, 250);
});

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key in keys) keys[key] = true;
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (key in keys) keys[key] = false;
});

// Networking / lobby
const lobbyEl = document.getElementById('lobby');
const lobbyStatusEl = document.getElementById('lobby-status');
const nicknameInput = document.getElementById('nickname');
const startBtn = document.getElementById('start-btn');
const adminPanelEl = document.createElement('div');
adminPanelEl.id = 'admin-panel';
adminPanelEl.style.display = 'none';
adminPanelEl.style.position = 'absolute';
adminPanelEl.style.top = '10px';
adminPanelEl.style.right = '10px';
adminPanelEl.style.zIndex = '100';
document.body.appendChild(adminPanelEl);

const adminStartBtn = document.createElement('button');
adminStartBtn.textContent = 'OYUNU BAŞLAT';
adminStartBtn.style.padding = '10px 20px';
adminStartBtn.style.backgroundColor = '#ff0000';
adminStartBtn.style.color = 'white';
adminStartBtn.style.border = '2px solid white';
adminStartBtn.style.fontFamily = 'monospace';
adminStartBtn.style.cursor = 'pointer';
adminPanelEl.appendChild(adminStartBtn);

adminStartBtn.addEventListener('click', () => {
    if (socket) socket.emit('startGame');
});

const playerListEl = document.getElementById('player-list');

function updatePlayerList() {
    playerListEl.innerHTML = ''; // Temizle
    Object.values(players).forEach(p => {
        const li = document.createElement('li');
        li.className = 'player-item';
        
        const spanName = document.createElement('span');
        spanName.textContent = p && typeof p.name === 'string' ? p.name : 'Bilinmeyen';
        spanName.style.color = '#fff';
        spanName.style.fontWeight = 'bold';
        li.appendChild(spanName);
        
        // Admin KICK Button
        if (myName === 'Raawlinns' && p.id !== myId) {
            const btn = document.createElement('button');
            btn.className = 'kick-btn';
            btn.textContent = 'AT';
            btn.onclick = () => {
                if(confirm(`${p.name} atılsın mı?`)) {
                    socket.emit('kickPlayer', p.id);
                }
            };
            li.appendChild(btn);
        }
        
        playerListEl.appendChild(li);
    });
}

// Tuzakları yol üzərində aydın, kiçik blok kimi çək (şəkil ölçüsünə uyğun)
function drawTraps() {
  if (trackDistance <= 0 || traps.length === 0) return;

  traps.forEach(trap => {
    if (trap.hit) return;
    let relDist = trap.z - distance;
    if (relDist > trackDistance / 2) relDist -= trackDistance;
    if (relDist < -trackDistance / 2) relDist += trackDistance;

    // Görüş məsafəsi – maşına kifayət qədər yaxın olan bütün tələləri göstər
    if (Math.abs(relDist) > 200) return;

    const scale = 1.0 / (1.0 + Math.max(0, relDist) * 0.03);

    const horizonY = 50 * CELL_SIZE;
    const baseY = 80 * CELL_SIZE;
    const trapY = horizonY + (baseY - horizonY) * scale;

    // Yolun mərkəzinə görə offset – sol/orta/sağ (trap.offset) + yol əyrisi
    const curveOffset = -curvature * Math.pow(1.0 - scale, 2) * 2.0;
    const worldOffset = (trap.offset + curveOffset) * scale;
    const trapCenterX = (LOGICAL_WIDTH / 2 + (LOGICAL_WIDTH * worldOffset) / 2.0) * CELL_SIZE;

    // Şəkil ölçüsünə yaxın blok
    const imgWidth = 22 * CELL_SIZE * scale;
    const imgHeight = 22 * CELL_SIZE * scale;
    const pad = 3 * scale;
    const blockW = imgWidth + pad * 2;
    const blockH = imgHeight + pad * 2;
    const blockX = trapCenterX - blockW / 2;
    const blockY = trapY - blockH;

    // Qırmızı/narıncı blok (şəkil qədər)
    ctx.fillStyle = 'rgba(255, 80, 0, 0.85)';
    ctx.fillRect(blockX, blockY, blockW, blockH);

    // Üstünə Tuzak.png (əgər yüklənibsə)
    if (trapImage.complete) {
      ctx.drawImage(
        trapImage,
        trapCenterX - imgWidth / 2,
        trapY - imgHeight,
        imgWidth,
        imgHeight
      );
    }
  });
}

// Bitiş direklərini start/finish xətti yaxınlığında çək
function drawFinishPosts() {
  if (!finishImage.complete || trackDistance <= 0) return;

  // Start xətti z ~= 0 qəbul edək
  const finishZ = 0;

  let relDist = finishZ - distance;
  if (relDist > trackDistance / 2) relDist -= trackDistance;
  if (relDist < -trackDistance / 2) relDist += trackDistance;

  // Uzaqdan da görünsün
  if (Math.abs(relDist) > 260) return;

  const scale = 1.0 / (1.0 + Math.max(0, relDist) * 0.02);

  const horizonY = 50 * CELL_SIZE;
  const baseY = 92 * CELL_SIZE;
  const postY = horizonY + (baseY - horizonY) * scale;

  const curveOffset = -curvature * Math.pow(1.0 - scale, 2) * 2.0;

  // Yolun sol və sağ kənarı üçün offset-lər
  const sideOffset = 1.8; // yolu tam bağlamasın, kənarda dursun

  const leftWorldOffset = (-sideOffset + curveOffset) * scale;
  const rightWorldOffset = (sideOffset + curveOffset) * scale;

  const leftX = (LOGICAL_WIDTH / 2 + (LOGICAL_WIDTH * leftWorldOffset) / 2.0) * CELL_SIZE;
  const rightX = (LOGICAL_WIDTH / 2 + (LOGICAL_WIDTH * rightWorldOffset) / 2.0) * CELL_SIZE;

  const postWidth = 28 * CELL_SIZE * scale;
  const postHeight = 40 * CELL_SIZE * scale;

  ctx.drawImage(
    finishImage,
    leftX - postWidth / 2,
    postY - postHeight,
    postWidth,
    postHeight
  );

  ctx.drawImage(
    finishImage,
    rightX - postWidth / 2,
    postY - postHeight,
    postWidth,
    postHeight
  );
}

// Scenery
const scenery = [];

// Tuzaklar
const traps = [];
const trapImage = new Image();
// Kök qovluqdakı "Diger resimler" altından yüklə
trapImage.src = '/Diger resimler/Tuzak.png';

// Bitiş çizgisi direkləri
const finishImage = new Image();
finishImage.src = '/Diger resimler/Bitiş_çizgisi.png';

function setupNetwork() {
  socket = io();

  socket.on('chatInit', (data) => {
    chatDisabled = !!(data && data.disabled);
    chatSlowModeSeconds = data && typeof data.slowModeSeconds === 'number' ? data.slowModeSeconds : 0;
    updateChatStatus();

    if (chatSlowModeSelect) chatSlowModeSelect.value = String(chatSlowModeSeconds);
    if (chatDisableToggle) chatDisableToggle.checked = chatDisabled;

    if (chatMessagesEl) chatMessagesEl.innerHTML = '';
    const history = data && Array.isArray(data.history) ? data.history : [];
    history.forEach((m) => {
      renderChatMessage(m);
    });
  });

  socket.on('chatMessage', (msg) => {
    renderChatMessage(msg);
  });

  socket.on('chatSystem', (msg) => {
    renderChatMessage({ id: msg.id || `${msg.ts || Date.now()}-${Math.floor(Math.random() * 1e9)}`, name: 'Sistem', text: msg.text || '', ts: msg.ts || Date.now(), type: 'system' });
  });

  socket.on('chatDeleted', (data) => {
    if (!data || typeof data.id !== 'string') return;
    removeChatMessageById(data.id);
  });

  socket.on('chatSettings', (data) => {
    chatDisabled = !!(data && data.disabled);
    chatSlowModeSeconds = data && typeof data.slowModeSeconds === 'number' ? data.slowModeSeconds : 0;
    if (chatSlowModeSelect) chatSlowModeSelect.value = String(chatSlowModeSeconds);
    if (chatDisableToggle) chatDisableToggle.checked = chatDisabled;
    updateChatStatus();
  });

  socket.on('chatError', (data) => {
    const t = data && typeof data.message === 'string' ? data.message : 'Sohbet hatası.';
    renderChatMessage({ id: `${Date.now()}-${Math.floor(Math.random() * 1e9)}`, name: 'Sistem', text: t, ts: Date.now(), type: 'system' });
  });

  if (!chatUiBound) {
    chatUiBound = true;

    if (chatSendBtn) {
      chatSendBtn.addEventListener('click', () => {
        if (!socket || !socket.connected) return;
        if (chatDisabled) return;
        const text = (chatInputEl && chatInputEl.value ? chatInputEl.value : '').trim();
        if (!text) return;
        socket.emit('chatSend', { text });
        if (chatInputEl) chatInputEl.value = '';
      });
    }

    if (chatInputEl) {
      chatInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (chatSendBtn) chatSendBtn.click();
        }
      });
    }

    if (chatSlowModeSelect) {
      chatSlowModeSelect.addEventListener('change', () => {
        if (myName !== 'Raawlinns') return;
        if (!socket || !socket.connected) return;
        const v = Number(chatSlowModeSelect.value);
        socket.emit('chatAdminUpdate', { slowModeSeconds: Number.isNaN(v) ? 0 : v, disabled: !!(chatDisableToggle && chatDisableToggle.checked) });
      });
    }

    if (chatDisableToggle) {
      chatDisableToggle.addEventListener('change', () => {
        if (myName !== 'Raawlinns') return;
        if (!socket || !socket.connected) return;
        const v = chatSlowModeSelect ? Number(chatSlowModeSelect.value) : 0;
        socket.emit('chatAdminUpdate', { slowModeSeconds: Number.isNaN(v) ? 0 : v, disabled: !!chatDisableToggle.checked });
      });
    }
  }

  startBtn.disabled = true;
  lobbyStatusEl.textContent = 'Serverə qoşulur...';
  
  socket.on('error', (err) => {
      alert(err.message);
      location.reload();
  });

  socket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      lobbyStatusEl.textContent = 'Bağlantı xətası: ' + err.message;
      startBtn.disabled = true;
  });

  socket.on('kicked', () => {
      alert('Admin tarafından atıldınız!');
      location.reload();
  });

  socket.on('connect', () => {
    lobbyStatusEl.textContent = 'Sunucuya bağlandı. Nick yaz ve "Oyuna katıl" tuşuna bas.';
    startBtn.disabled = false;
  });

  socket.on('disconnect', () => {
    lobbyStatusEl.textContent = 'Sunucu bağlantısı koptu.';
    startBtn.disabled = true;
  });

  socket.on('welcome', (payload) => {
    myId = payload.id;
    players = payload.players || {};
    gameState = payload.gameState || 'WAITING';
    countdownVal = payload.countdown || 0;
    
    lobbyEl.classList.add('hidden');
    
    // Admin check
    if (myName === 'Raawlinns') {
        adminPanelEl.style.display = 'block';
        if (chatAdminControlsEl) chatAdminControlsEl.classList.remove('hidden');
    }
    
    updatePlayerList();
    
    // Başlangıç konumu
    const myP = players[myId];
    if (myP) {
        const lane = myP.laneIndex || 0;
        const laneOffsets = [-0.6, -0.2, 0.2, 0.6];
        playerX = laneOffsets[lane % 4];
    }

    // Mobil cihazdan girilirsə, serverə "məni mobil kimi işarələ və nick sonuna 📱 əlavə et" de
    if (IS_MOBILE && socket && socket.connected) {
      socket.emit('markMobile');
    }
  });

  socket.on('state', (serverPlayers) => {
    // Sadece yeni bağlananları güncelle, mevcutların detayını bozma
    const serverIds = Object.keys(serverPlayers || {});

    // Remove disconnected
    Object.keys(players).forEach((pid) => {
      if (!serverPlayers[pid]) delete players[pid];
    });

    // Add missing / merge non-physics fields
    serverIds.forEach((pid) => {
      if (!players[pid]) {
        players[pid] = serverPlayers[pid];
        return;
      }
      const sp = serverPlayers[pid];
      if (!sp) return;
      if (typeof sp.name === 'string') players[pid].name = sp.name;
      if (typeof sp.displayName === 'string') players[pid].displayName = sp.displayName;
      if (typeof sp.isMobile === 'boolean') players[pid].isMobile = sp.isMobile;
      if (typeof sp.laneIndex === 'number') players[pid].laneIndex = sp.laneIndex;
      if (typeof sp.carSpriteIndex === 'number') players[pid].carSpriteIndex = sp.carSpriteIndex;
    });

    updatePlayerList();
  });
  
  socket.on('gameUpdate', (data) => {
      if (data.type === 'STATE_CHANGE') {
          gameState = data.state;
          if (gameState === 'COUNTDOWN') {
              stopSfxLoop();
              // Reset local state
              speed = 0;
              distance = 0;
              currentLapTime = 0;
              currentLap = 0;
              lap1WinnerName = '';
              lap1WinnerTimer = 0;
              raceWinnerName = '';
              raceWinnerTimer = 0;
              lapWinners = { 1: '', 2: '', 3: '', 4: '', 5: '' };
              lapWinnerOverlayText = '';
              lapWinnerOverlayTimer = 0;
              // Şeride göre tekrar hizala
              const myP = players[myId];
              if (myP) {
                const lane = myP.laneIndex || 0;
                const laneOffsets = [-0.6, -0.2, 0.2, 0.6];
                playerX = laneOffsets[lane % 4];
              }
          }
          if (gameState === 'RACING') {
              startSfxLoop();
          } else {
              stopSfxLoop();
          }
      } else if (data.type === 'COUNTDOWN') {
          countdownVal = data.value;
      } else if (data.type === 'RESET_POSITIONS') {
          players = data.players || {};
          Object.keys(players).forEach((pid) => {
            const p = players[pid];
            if (!p) return;
            if (typeof p.distance === 'number') p.renderDistance = p.distance;
          });

          // Lokal state-i də sıfırla ki, teleport dərhal görünsün
          speed = 0;
          distance = 0;
          curvature = 0;
          trackCurvature = 0;
          playerCurvature = 0;
          carPos = 0;
          playerX = 0;
          nitroActive = false;
          nitroBoostFactor = 1.0;
          skidMarks = [];

          const myP = myId ? players[myId] : null;
          if (myP) {
            const lane = myP.laneIndex || 0;
            const laneOffsets = [-0.6, -0.2, 0.2, 0.6];
            playerX = laneOffsets[lane % 4];
            carPos = playerX;
          }
      } else if (data.type === 'LAP_WINNER') {
          const lap = data.lap | 0;
          if (lap >= 1 && lap <= 5 && !lapWinners[lap]) {
              lapWinners[lap] = data.name || 'Bilınməyən';
              lapWinnerOverlayText = `${lapWinners[lap]} ${lap}. turu tamamladı!`;
              lapWinnerOverlayTimer = 4.0;
              if (lap === 1 && !lap1WinnerName) {
                lap1WinnerName = lapWinners[lap];
                lap1WinnerTimer = 4.0;
              }
          }
      } else if (data.type === 'LAP1_WINNER') {
          // İlk lap qalibi (yalnız bir dəfə gəlir)
          if (!lap1WinnerName) {
              lap1WinnerName = data.name || 'Bilınməyən';
              lap1WinnerTimer = 4.0; // 4 saniyə göstər
          }
      } else if (data.type === 'RACE_WINNER') {
          // 5-ci lap qalibi (yarış qalibi)
          if (!raceWinnerName) {
              raceWinnerName = data.name || 'Bilınməyən';
              raceWinnerTimer = 15.0; // 15 saniyə göstər
          }
      }
  });

  if (socket) {
    socket.on('playerUpdated', (p) => {
      if (players[p.id]) {
        Object.assign(players[p.id], p);
        if (typeof players[p.id].renderDistance !== 'number' && typeof players[p.id].distance === 'number') {
          players[p.id].renderDistance = players[p.id].distance;
        }
      }
      if (p && p.name === 'Raawlinns' && gameState !== 'COUNTDOWN') {
        startCountdown();
      }
    });
  }

  startBtn.addEventListener('click', () => {
    const name = (nicknameInput.value || '').trim();
    if (!name) {
      lobbyStatusEl.textContent = 'Lütfen bir nick yaz.';
      return;
    }

    let password = '';
    if (name === 'Raawlinns') {
      const entered = window.prompt('Raawlinns nicki için şifre:');
      if (entered === null) {
        // Vazgeçti
        return;
      }
      password = String(entered);
    }

    myName = name;
    playSound('start');
    socket.emit('join', { name: myName, mobile: IS_MOBILE, password });
    startBtn.disabled = true;
    lobbyStatusEl.textContent = 'Oyuna giriliyor...';
  });

}

// Track Definition (Segment based) - C++ m_vecTrack portu
// { curvature, length }
const trackSegments = [
  { curvature: 0.0,  length: 10.0 },
  { curvature: 0.0,  length: 200.0 },
  { curvature: 0.0,  length: 400.0 },
  { curvature: -1.0, length: 100.0 },
  { curvature: 0.0,  length: 200.0 },
  { curvature: -1.0, length: 200.0 },
  { curvature: 1.0,  length: 200.0 },
  { curvature: 0.0,  length: 200.0 },
  { curvature: 0.02, length: 500.0 },
  { curvature: 0.0,  length: 200.0 },
];

trackDistance = 0;

function initTrack() {
    trackDistance = 0;
    trackSegments.forEach((seg) => {
        seg.startZ = trackDistance;
        trackDistance += seg.length;
        seg.endZ = trackDistance;
    });

    // Reset scenery based on new track
    initScenery();

    // Tuzakları yenidən qur
    initTraps();
}

function getTrackCurvature(z) {
    // Wrap z into [0, trackDistance)
    z = z % trackDistance;
    if (z < 0) z += trackDistance;

    // Find segment (C++ m_vecTrack tarzi)
    for (const seg of trackSegments) {
        if (z >= seg.startZ && z < seg.endZ) {
            return seg.curvature;
        }
    }
    return 0.0;
}

function initScenery() {
    scenery.length = 0; 
    const density = 0.05; 
    
    for (let z = 0; z < trackDistance; z += (10 + Math.random() * 20)) {
        // Sol taraf
        scenery.push({
            type: Math.random() > 0.3 ? 'tree' : 'bush',
            offset: -1.5 - Math.random() * 5.0, 
            z: z
        });
        
        // Sağ taraf
        scenery.push({
            type: Math.random() > 0.3 ? 'tree' : 'bush',
            offset: 1.5 + Math.random() * 5.0, 
            z: z
        });
    }
}

// Tuzakları yarad (hər 800 metrdə bir, sabit nöqtələrdə)
function initTraps() {
    traps.length = 0;
    if (!trackDistance || trackDistance <= 0) return;

    const laneOffsets = [-0.35, 0.0, 0.35];
    let i = 0;
    for (let z = 80; z < trackDistance; z += 800) {
        const offset = laneOffsets[i % laneOffsets.length];
        traps.push({ z, offset, hit: false });
        i++;
    }
}

function handleInput(elapsed) {
  carDirection = 0;
  nitroActive = false;

  // Sadece yarış başlarsa hareket et
  if (gameState === 'COUNTDOWN') {
      speed = Math.max(0, speed - 2.0 * elapsed); // Durdur
      return;
  }
  // WAITING/RACING: serbest sürüş

  const up = keys.w; // Sadece W
  const left = keys.a; // Sadece A
  const right = keys.d; // Sadece D
  const nitroKey = keys[' ']; // Space

  // C++: m_speed += 2.0f * elapsed (yuxarı), əks halda -1.0f * elapsed
  if (up) {
      // 0 -> 100 (speed 0 -> 1) ~5 saniyədə olsun deyə: acc ≈ 0.2
      let acc = 0.2;
      // Nitro varsa, charge xərclə və aktiv et (max sürətdə də işləsin)
      if (nitroKey && nitroCharge > 0) {
          nitroActive = true;
          nitroCharge -= (100.0 / NITRO_MAX_DURATION) * elapsed;
          if (nitroCharge < 0) nitroCharge = 0;
      } else if (!nitroKey && nitroCharge < 100) {
          nitroCharge += (100.0 / NITRO_RECHARGE_TIME) * elapsed;
          if (nitroCharge > 100) nitroCharge = 100;
      }
      speed += acc * elapsed;
  } else {
      speed -= 1.0 * elapsed;
      // Nitro yığılması (pedal buraxılanda da yığılmağa davam etsin)
      if (!nitroKey && nitroCharge < 100) {
          nitroCharge += (100.0 / NITRO_RECHARGE_TIME) * elapsed;
          if (nitroCharge > 100) nitroCharge = 100;
      }
  }

  // Car Curvature: sürət artdıqca döndürmək çətinləşir
  if (left) {
      playerCurvature -= 0.7 * elapsed * (1.0 - speed / 2.0);
      carDirection = -1;
  }
  if (right) {
      playerCurvature += 0.7 * elapsed * (1.0 - speed / 2.0);
      carDirection = +1;
  }
}

function update(elapsed) {
  handleInput(elapsed);

  // Drift / skid marks (ekranda qısa ömürlü izlər)
  if (gameState === 'RACING' && speed > 0.55 && Math.abs(carDirection) > 0) {
    const w = canvas.width;
    const carScreenX = (LOGICAL_WIDTH / 2 + (LOGICAL_WIDTH * carPos) / 2.0 - 7) * CELL_SIZE;
    const carScreenY = 80 * CELL_SIZE;
    const carWidth = 14 * CELL_SIZE;
    const carHeight = 6 * CELL_SIZE;
    const baseX = carScreenX + carWidth / 2;
    const baseY = carScreenY + carHeight;

    skidMarks.push({ x: baseX - carWidth * 0.25, y: baseY - 2, life: 0.45 });
    skidMarks.push({ x: baseX + carWidth * 0.25, y: baseY - 2, life: 0.45 });
    if (skidMarks.length > 120) skidMarks = skidMarks.slice(-120);
  }

  skidMarks.forEach((m) => {
    m.life -= elapsed;
    m.y += 40 * elapsed;
  });
  skidMarks = skidMarks.filter((m) => m.life > 0);

  // Nitro boost-u birdən düşməsin: faktor yavaş-yavaş hədəfə yaxınlaşsın
  const targetBoost = nitroActive ? NITRO_SPEED_MULTIPLIER : 1.0;
  nitroBoostFactor += (targetBoost - nitroBoostFactor) * Math.min(1, elapsed * 6.0);
  if (Math.abs(nitroBoostFactor - targetBoost) < 0.001) nitroBoostFactor = targetBoost;

  const moveSpeed = speed * nitroBoostFactor;

  // C++: off-track cəzası - oyunçu əyriliyi ilə track əyriliyi çox fərqlidirsə, sürəti azaldır
  if (Math.abs(playerCurvature - trackCurvature) >= 0.8) {
      speed -= 5.0 * elapsed;
  }

  // Hız limiti (0..1) - baz sürət
  if (speed < 0.0) speed = 0.0;
  if (speed > 1.0) speed = 1.0;

  // İlerleme (nitro ilə boost olunmuş real sürət)
  distance += 70.0 * moveSpeed * elapsed;

  // Lap vaxtı
  currentLapTime += elapsed;
  if (distance >= trackDistance && trackDistance > 0) {
    distance -= trackDistance;
    lapTimes.unshift(currentLapTime);
    lapTimes = lapTimes.slice(0, 5);
    currentLapTime = 0.0;

    // Yeni lap-a keçid
    currentLap += 1;
    // Serverə xəbər ver (ilk lap və 5-ci lap qalibləri üçün istifadə olunacaq)
    if (socket && myId && socket.connected) {
      socket.emit('lapCompleted', { lap: currentLap });
    }
  }

  // Track bölməsini tap və hədəf əyriliyə interpolasiya et (C++-dakı kimi)
  let offset = 0;
  let sectionIndex = 0;
  while (sectionIndex < trackSegments.length && offset <= distance) {
      offset += trackSegments[sectionIndex].length;
      sectionIndex++;
  }
  if (sectionIndex === 0) sectionIndex = 1;
  const targetCurvature = trackSegments[sectionIndex - 1].curvature;
  const trackCurveDiff = (targetCurvature - curvature) * elapsed * moveSpeed;

  curvature += trackCurveDiff;
  trackCurvature += curvature * elapsed * moveSpeed;

  // Maşının ekrandakı mövqeyi: oyunçu əyriliyi ilə track əyriliyi fərqi
  carPos = playerCurvature - trackCurvature;
  // Multiplayer üçün playerX-i carPos ilə sinxron saxla
  playerX = carPos;

  // Tuzaklarla toqquşma: sadə hitbox + yanından keçəndə yox olsun
  if (trackDistance > 0 && traps.length > 0) {
    traps.forEach(trap => {
      if (trap.hit) return;
      // trap.z ilə cari distance arasındakı fərqi tap (wrap ilə)
      let rel = trap.z - distance;
      if (rel > trackDistance / 2) rel -= trackDistance;
      if (rel < -trackDistance / 2) rel += trackDistance;

      // Tələ nöqtəsini keçibsə (dəyilməyibsə də), dərhal yox olsun
      if (rel < -5) {
        trap.hit = true;
        return;
      }

      // Önümüzdə yaxın məsafədədirsə
      if (Math.abs(rel) < 5) {
        const lateralDiff = carPos - trap.offset;
        if (Math.abs(lateralDiff) < 0.3 && !trap.hit) {
          // Tələyə dəyəndə sürəti anlıq 50% azaldırıq
          speed *= 0.5;
          trap.hit = true;
        } else if (!trap.hit) {
          // Yanından keçdisə (dəymədisə də), dərhal yox olsun
          trap.hit = true;
        }
      }
    });
  }

  // Winner overlay taymerlərini azaldırıq
  if (lap1WinnerTimer > 0) {
    lap1WinnerTimer -= elapsed;
    if (lap1WinnerTimer < 0) lap1WinnerTimer = 0;
  }
  if (raceWinnerTimer > 0) {
    raceWinnerTimer -= elapsed;
    if (raceWinnerTimer < 0) raceWinnerTimer = 0;
  }
  if (lapWinnerOverlayTimer > 0) {
    lapWinnerOverlayTimer -= elapsed;
    if (lapWinnerOverlayTimer < 0) lapWinnerOverlayTimer = 0;
  }

  // Hərəkət məlumatını serverə göndər (tam state)
  // playerX eklendi
  if (socket && myId && socket.connected) {
    const nowMs = performance.now();
    if (nowMs - lastStateSentAt >= STATE_SEND_INTERVAL_MS) {
      lastStateSentAt = nowMs;
      socket.emit('updateState', {
        direction: carDirection,
        distance: distance,
        speed: speed,
        nitroActive: nitroActive,
        playerX: playerX
      });
    }
  }
}

function drawScenery() {
    // Objeleri distance'a göre sırala (uzaktan yakına)
    // Ancak döngü içinde yapmak pahalı olabilir.
    // Şimdilik sadece görünür olanları bulup çizelim.
    
    scenery.forEach(obj => {
        let relDist = obj.z - distance;
        if (relDist < -10) relDist += trackDistance;
        if (relDist > trackDistance - 10) relDist -= trackDistance;
        
        if (relDist < 1 || relDist > 150) return; // Görüş mesafesi (LOD)

        const scale = 1.0 / (1.0 + relDist * 0.05);
        
        // Perspective calculation (same as cars)
        const curveOffset = -curvature * Math.pow(1.0 - scale, 2) * 2.0;
        const screenX = (LOGICAL_WIDTH / 2 + (LOGICAL_WIDTH * (obj.offset + curveOffset) * scale) / 2.0) * CELL_SIZE;
        
        const horizonY = 50 * CELL_SIZE;
        const baseY = 80 * CELL_SIZE;
        const screenY = horizonY + (baseY - horizonY) * scale;
        
        const size = (obj.type === 'tree' ? 40 : 15) * scale * (CELL_SIZE / 4);
        
        // Draw Tree/Bush
        if (obj.type === 'tree') {
            // Trunk
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(screenX - size/4, screenY - size, size/2, size);
            // Leaves
            ctx.fillStyle = '#006400';
            ctx.beginPath();
            ctx.moveTo(screenX, screenY - size * 3);
            ctx.lineTo(screenX - size, screenY - size * 0.5);
            ctx.lineTo(screenX + size, screenY - size * 0.5);
            ctx.fill();
        } else {
            // Bush
            ctx.fillStyle = '#228B22';
            ctx.beginPath();
            ctx.arc(screenX, screenY - size/2, size, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function drawFrame() {
  const w = canvas.width;
  const h = canvas.height;

  // Ekranı təmizlə
  ctx.clearRect(0, 0, w, h);

  // Sky (üst yarı)
  for (let y = 0; y < LOGICAL_HEIGHT / 2; y++) {
    for (let x = 0; x < LOGICAL_WIDTH; x++) {
      const color = y < LOGICAL_HEIGHT / 4 ? '#0000ff' : '#00008b';
      ctx.fillStyle = color;
      ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
  }

  // Hills
  for (let x = 0; x < LOGICAL_WIDTH; x++) {
    const hillHeight = Math.abs(Math.sin(x * 0.01 + trackCurvature) * 16.0) | 0;
    for (let y = LOGICAL_HEIGHT / 2 - hillHeight; y < LOGICAL_HEIGHT / 2; y++) {
      ctx.fillStyle = '#b8860b';
      ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
  }

  // Road + Grass + Kerbs (aşağı yarı)
  for (let y = 0; y < LOGICAL_HEIGHT / 2; y++) {
    const perspective = y / (LOGICAL_HEIGHT / 2.0);
    let roadWidth = 0.1 + perspective * 0.8;
    let clipWidth = roadWidth * 0.15;
    roadWidth *= 0.62;
    clipWidth *= 0.9;

    const middlePoint = 0.5 + curvature * Math.pow(1.0 - perspective, 3);

    const leftGrass = (middlePoint - roadWidth - clipWidth) * LOGICAL_WIDTH;
    const leftClip = (middlePoint - roadWidth) * LOGICAL_WIDTH;
    const rightClip = (middlePoint + roadWidth) * LOGICAL_WIDTH;
    const rightGrass = (middlePoint + roadWidth + clipWidth) * LOGICAL_WIDTH;

    const row = LOGICAL_HEIGHT / 2 + y;

    const grassColor = Math.sin(20.0 * Math.pow(1.0 - perspective, 3) + distance * 0.1) > 0.0
      ? '#008000'
      : '#006400';
    const clipColor = Math.sin(80.0 * Math.pow(1.0 - perspective, 2) + distance) > 0.0
      ? '#ff0000'
      : '#ffffff';

    const roadColor = '#808080'; // Yol rəngi: həmişə boz olsun

    for (let x = 0; x < LOGICAL_WIDTH; x++) {
      let color;
      if (x < leftGrass) color = grassColor;
      else if (x < leftClip) color = clipColor;
      else if (x < rightClip) color = roadColor;
      else if (x < rightGrass) color = clipColor;
      else color = grassColor;

      ctx.fillStyle = color;
      ctx.fillRect(x * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
  }

  // Tuzakları və bitiş direklərini yolun üstündə çək
  drawTraps();
  drawFinishPosts();

  // Drift izləri
  if (skidMarks.length > 0) {
    skidMarks.forEach((m) => {
      const a = Math.max(0, Math.min(1, m.life / 0.45));
      ctx.fillStyle = `rgba(0, 0, 0, ${0.55 * a})`;
      ctx.fillRect(m.x - 6, m.y, 12, 3);
    });
  }

  // Car (ekranın aşağısına yaxın, ortada). Lane sistemindən istifadə et.
  const myPlayer = myId && players[myId] ? players[myId] : null;
  // carPos artıq update() içində hesablanıb

  const carScreenX = (LOGICAL_WIDTH / 2 + (LOGICAL_WIDTH * carPos) / 2.0 - 7) * CELL_SIZE;
  const carScreenY = 80 * CELL_SIZE;
  const carWidth = 14 * CELL_SIZE;
  const carHeight = 6 * CELL_SIZE;

  // Öz maşın üçün sprite seç (serverdən gələn carSpriteIndex)
  const mySpriteIndex = myPlayer && typeof myPlayer.carSpriteIndex === 'number'
    ? Math.max(0, Math.min(carSpriteImages.length - 1, myPlayer.carSpriteIndex | 0))
    : 0;
  const myCarImage = carSpriteImages[mySpriteIndex] || carSpriteImages[0];

  if (myCarImage && myCarImage.complete) {
    let frameIndex = 0;
    if (carDirection > 0) frameIndex = 1;
    if (carDirection < 0) frameIndex = 2;

    const sx = frameIndex * CAR_SPRITE_SOURCE_WIDTH;

    // Dönüş animasyonu: Canvas rotation
    const rotationAngle = carDirection * 0.785;

    // Nitro efekti (öz maşın arxasında partiküller)
    if (nitroActive) {
        ctx.fillStyle = `rgba(0, 255, 255, ${0.5 + Math.random() * 0.5})`;
        ctx.beginPath();
        ctx.arc(carScreenX + carWidth/2, carScreenY + carHeight, 10 + Math.random() * 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#ffaa00';
        for(let i=0; i<3; i++) {
            ctx.fillRect(
                carScreenX + carWidth/2 - 5 + Math.random()*10,
                carScreenY + carHeight - 5 + Math.random()*10,
                4, 4
            );
        }
    }

    ctx.save();
    ctx.translate(carScreenX + carWidth / 2, carScreenY + carHeight / 2);
    ctx.rotate(rotationAngle);
    ctx.drawImage(
      myCarImage,
      sx,
      0,
      CAR_SPRITE_SOURCE_WIDTH,
      CAR_SPRITE_SOURCE_HEIGHT,
      -carWidth / 2,
      -carHeight / 2,
      carWidth,
      carHeight
    );
    ctx.restore();
  } else {
    // Sprite yüklənməsə də maşın yox olmasın
    ctx.fillStyle = '#ffdd00';
    ctx.fillRect(carScreenX, carScreenY, carWidth, carHeight);
  }

  // Öz nickname-ni maşının üzərində göstər
  if (myPlayer && myPlayer.name) {
    ctx.fillStyle = '#ffff00';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4; // Thicker outline
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const text = myPlayer.name;
    
    // Stroke first for outline
    ctx.strokeText(text, carScreenX + carWidth / 2, carScreenY - 10);
    // Then fill
    ctx.fillText(text, carScreenX + carWidth / 2, carScreenY - 10);
  }

  // Digər oyunçuların maşınlarını çək (Depth & Scaling)
  Object.keys(players).forEach((id) => {
    if (id === myId) return;
    const p = players[id];
    if (!p) return;

    if (typeof p.renderDistance !== 'number') {
      p.renderDistance = typeof p.distance === 'number' ? p.distance : 0;
    } else if (typeof p.distance === 'number' && trackDistance > 0) {
      const rawDiff = p.distance - p.renderDistance;
      let diff = rawDiff;
      if (diff > trackDistance / 2) diff -= trackDistance;
      if (diff < -trackDistance / 2) diff += trackDistance;
      p.renderDistance += diff * 0.2;

      if (p.renderDistance < 0) p.renderDistance += trackDistance;
      if (p.renderDistance >= trackDistance) p.renderDistance -= trackDistance;
    }

    // Relative distance calculation
    let relDist = (p.renderDistance || 0) - distance;
    
    // Wrap around fix (basic)
    if (relDist > trackDistance / 2) relDist -= trackDistance;
    if (relDist < -trackDistance / 2) relDist += trackDistance;

    // Yalnız görünən məsafədəkiləri çək (-10m arxadan, 100m qabağa)
    if (relDist < -10 || relDist > 100) return;

    // Scale factor
    const scale = 1.0 / (1.0 + Math.max(0, relDist) * 0.05);
    
    // Diğer oyuncuların pozisyonu (PlayerX support)
    const otherP_X = p.playerX !== undefined ? p.playerX : [-0.6, -0.2, 0.2, 0.6][(p.laneIndex || 0) % 4];
    
    // Perspective fix
    const curveOffset = -curvature * Math.pow(1.0 - scale, 2) * 2.0; 
    const otherX_Center = (LOGICAL_WIDTH / 2 + (LOGICAL_WIDTH * (otherP_X + curveOffset) * scale) / 2.0) * CELL_SIZE;
    
    const horizonY = 50 * CELL_SIZE;
    const baseY = 80 * CELL_SIZE;
    const otherY = horizonY + (baseY - horizonY) * scale;

    const w = carWidth * scale;
    const h = carHeight * scale;
    const otherX = otherX_Center - w / 2;

    let frameIndex = 0;
    if (p.direction > 0) frameIndex = 1;
    if (p.direction < 0) frameIndex = 2;

    const sx = frameIndex * CAR_SPRITE_SOURCE_WIDTH;
    
    // Rakip Nitro
    if (p.nitroActive) {
        ctx.fillStyle = `rgba(0, 255, 255, ${0.5 * scale})`;
        ctx.beginPath();
        ctx.arc(otherX + w/2, otherY + h, 10 * scale, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Hər rəqib üçün sprite seç (carSpriteIndex)
    const spriteIndex = typeof p.carSpriteIndex === 'number'
      ? Math.max(0, Math.min(carSpriteImages.length - 1, p.carSpriteIndex | 0))
      : 0;
    const otherCarImage = carSpriteImages[spriteIndex] || carSpriteImages[0];

    if (!otherCarImage || !otherCarImage.complete) {
      // Sprite yüklənməsə də rəqib maşın itmesin
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(otherX + w/2 - w/2, otherY, w, h);
      return;
    }

    ctx.save();
    ctx.globalAlpha = Math.min(1.0, scale + 0.2); // Uzaqdakılar biraz solğun
    ctx.translate(otherX + w/2, otherY + h/2);
    // Onların da dönüşünü göstər
    ctx.rotate((p.direction || 0) * 0.1);
    
    ctx.drawImage(
      otherCarImage,
      sx,
      0,
      CAR_SPRITE_SOURCE_WIDTH,
      CAR_SPRITE_SOURCE_HEIGHT,
      -w/2,
      -h/2,
      w,
      h
    );
    ctx.restore();

    if (p.name) {
      ctx.fillStyle = '#ffff00';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.font = `bold ${Math.max(10, 14 * scale)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const text = p.name;
      ctx.strokeText(text, otherX + w / 2, otherY - 8 * scale);
      ctx.fillText(text, otherX + w / 2, otherY - 8 * scale);
    }
  });

  // HUD yazıları (Türkcə)
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.font = '16px monospace';
  ctx.textBaseline = 'top';

  const effectiveSpeed = speed * nitroBoostFactor;
  ctx.fillText(`Mesafe: ${distance.toFixed(2)} m`, 10, 10);
  ctx.fillText(`Hız: ${(effectiveSpeed * 100).toFixed(0)} km/s`, 10, 30);
  
  // Nitro Bar
  ctx.fillStyle = '#333';
  ctx.fillRect(10, 60, 100, 10);
  ctx.fillStyle = '#00ffff';
  ctx.fillRect(10, 60, nitroCharge, 10);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(10, 60, 100, 10);
  ctx.fillStyle = '#fff';
  ctx.font = '12px monospace';
  ctx.fillText(`NITRO (SPACE) ${Math.round(nitroCharge)}%`, 10, 75);

  const lapStr = formatTime(currentLapTime);
  ctx.font = '16px monospace';
  ctx.fillText(`Tur süresi: ${lapStr}`, 10, 100);

  ctx.fillText('Son 5 tur:', 10, 130);
  lapTimes.forEach((t, i) => {
    ctx.fillText(formatTime(t), 10, 150 + i * 18);
  });

  if (raceWinnerName) {
    ctx.fillStyle = '#ffff00';
    ctx.font = '14px monospace';
    ctx.fillText(`5. Tur Kazanan: ${raceWinnerName}`, 10, 150 + 5 * 18 + 10);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px monospace';
  }

  // Aşağı sol: Lap HUD (hər oyunçu üçün lokal) – iri fonla
  const lapBoxW = 200;
  const lapBoxH = 60;
  const lapBoxX = 5;
  const lapBoxY = h - lapBoxH - 10;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(lapBoxX, lapBoxY, lapBoxW, lapBoxH);
  ctx.strokeStyle = '#ffff00';
  ctx.lineWidth = 2;
  ctx.strokeRect(lapBoxX, lapBoxY, lapBoxW, lapBoxH);

  ctx.fillStyle = '#ffffff';
  ctx.font = '18px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const lapText = `Lap: ${Math.min(currentLap + 1, 5)}/5`;
  ctx.fillText(lapText, lapBoxX + 10, lapBoxY + lapBoxH / 2);

  // Countdown / Game State Overlay
  if (gameState === 'COUNTDOWN') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, w, h);
      
      ctx.fillStyle = '#ffff00';
      ctx.font = '80px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(countdownVal > 0 ? countdownVal : 'GO!', w/2, h/2);
  } else if (gameState === 'WAITING') {
      ctx.fillStyle = '#ffffff';
      ctx.font = '20px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('Oyuncular bekleniyor...', w/2, 50);
  }

  // Lap winner overlay (lap 1..5) - small overlay disabled (use big overlay only)

  // Lap qalibləri üçün ortada overlay-lər
  // Lap winner overlay (big, for every lap 1..5)
  if (lapWinnerOverlayTimer > 0 && lapWinnerOverlayText) {
      const alpha = Math.min(1, lapWinnerOverlayTimer / 4.0 + 0.2);
      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${0.6 * alpha})`;
      ctx.fillRect(0, h * 0.3, w, h * 0.4);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
      ctx.font = '48px monospace';
      ctx.fillText(lapWinnerOverlayText, w / 2, h / 2);
      ctx.restore();
  }

  // 5-ci lap / yarış qalibi (15 saniyə, daha böyük effekt)
  if (raceWinnerTimer > 0 && raceWinnerName) {
      const alpha = Math.min(1, raceWinnerTimer / 15.0 + 0.3);
      ctx.save();
      // Arxa planı bir az daha güclü qaranlıq
      ctx.fillStyle = `rgba(0, 0, 0, ${0.75 * alpha})`;
      ctx.fillRect(0, 0, w, h);

      // Parlayan çərçivə
      const pad = 40;
      ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.font = '54px monospace';
      ctx.fillText(`${raceWinnerName} YARIŞI KAZANDI!`, w / 2, h / 2);

      ctx.font = '24px monospace';
      ctx.fillText('Yeni yarış başlayana kadar bekleniyor...', w / 2, h / 2 + 60);
      ctx.restore();
  }
}

function formatTime(t) {
  const minutes = Math.floor(t / 60.0);
  const seconds = Math.floor(t - minutes * 60.0);
  let ms = Math.floor((t - seconds) * 1000.0);
  if (ms > 99999) ms = 99999;
  return `${minutes}.${seconds}:${ms}`;
}

let lastTime = performance.now();

function loop(now) {
  const deltaSec = (now - lastTime) / 1000;
  lastTime = now;

  // Çox böyük sıçrayışlar olmasın deyə limitləyək (tab dəyişəndə və s.)
  const elapsed = Math.min(deltaSec, 0.05); // maksimum ~50 ms

  update(elapsed);
  drawFrame();

  requestAnimationFrame(loop);
}

initTrack();
  setupNetwork();
  requestAnimationFrame(loop);
  
  // Audio Context (Tarayıcı etkileşimi gerektirir)
  let audioCtx = null;
  
  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }
  
  // Basit osilatör tabanlı ses yöneticisi
  function playSound(type, val) {
    if (!audioCtx) initAudio();
    if (!audioCtx) return;
  
    if (type === 'start') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
  
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } else if (type === 'engine') {
      // Motor sesi sürekli çalınabilir ama basitlik için anlık "bip"ler yerine
      // hız arttıkça pitch değişimi simülasyonu yapılabilir.
      // Burada sadece çok basit bir noise/hum efekti simüle edeceğiz.
      // (Performans için her frame çağrılmamalı, ama bu demo için idare eder)
      
      // Not: Her frame oscillator yaratmak kötüdür. 
      // Ancak basit tutmak için şimdilik boş bırakıyorum veya çok nadir sesler ekliyorum.
      // Engine sesi sürekli loop olmalı, buraya sığdırmak zor.
    }
  }
  
  // Kullanıcı etkileşimi ile sesi başlat
  document.addEventListener('click', initAudio, { once: true });
  document.addEventListener('keydown', initAudio, { once: true });
