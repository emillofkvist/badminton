// ============================================================
// APP STATE
// ============================================================

const App = {
  screen: 'setup',
  gameType: 'singles',
  nameA: 'Team A',
  nameB: 'Team B',
  soundEnabled: true,
  applauseEnabled: true,
};

// ============================================================
// SCREEN MANAGEMENT
// ============================================================

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  App.screen = id;

}

// ============================================================
// SETUP
// ============================================================

function setType(type) {
  App.gameType = type;
  document.getElementById('btn-singles').classList.toggle('active', type === 'singles');
  document.getElementById('btn-doubles').classList.toggle('active', type === 'doubles');
}

function setSound(enabled) {
  App.soundEnabled = enabled;
  document.getElementById('btn-sound-on').classList.toggle('active', enabled);
  document.getElementById('btn-sound-off').classList.toggle('active', !enabled);
}

function setApplause(enabled) {
  App.applauseEnabled = enabled;
  document.getElementById('btn-applause-on').classList.toggle('active', enabled);
  document.getElementById('btn-applause-off').classList.toggle('active', !enabled);
}

async function startCamera() {
  App.nameA = document.getElementById('name-a').value.trim() || 'Team A';
  App.nameB = document.getElementById('name-b').value.trim() || 'Team B';

  // Init AudioContext here (must be inside user gesture on iOS)
  AudioModule.init();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, min: 15 },
      },
      audio: false,
    });
    const video = document.getElementById('camera-video');
    video.srcObject = stream;
    await video.play();
    // Wait for first frame to be available (important on iOS)
    await new Promise(resolve => {
      if (video.readyState >= 2) { resolve(); return; }
      video.addEventListener('canplay', resolve, { once: true });
    });
    showScreen('calibration');
    CalibrationModule.init();
  } catch (err) {
    alert('Kunde inte starta kameran: ' + err.message);
  }
}

// ============================================================
// CALIBRATION
// ============================================================

const CalibrationModule = {
  corners: [],
  canvas: null,
  ctx: null,
  rafId: null,
  STORAGE_KEY: 'badminton_court_corners',

  init() {
    this.canvas = document.getElementById('calibration-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.canvas.addEventListener('click', (e) => this.handleTap(e));
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.handleTap({ clientX: t.clientX, clientY: t.clientY });
    });

    // Start video-to-canvas render loop
    this.startRender();

    // Check for saved calibration
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      try {
        const corners = JSON.parse(saved);
        if (corners.length === 4) {
          this.corners = corners;
          this.showConfirm();
          document.getElementById('calibration-instruction').textContent = 'Används sparad kalibrering. Bekräfta eller gör om.';
          return;
        }
      } catch(e) {}
    }
    this.reset();
  },

  startRender() {
    const video = document.getElementById('camera-video');
    const draw = () => {
      if (App.screen !== 'calibration') return; // stop when leaving
      this.rafId = requestAnimationFrame(draw);
      this.draw(video);
    };
    this.rafId = requestAnimationFrame(draw);
  },

  stop() {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  },

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  reset() {
    this.corners = [];
    this.updateDots();
    document.getElementById('calibration-instruction').textContent =
      'Tryck på planens 4 hörn i ordning:\nvänster bak → höger bak → höger fram → vänster fram';
    document.getElementById('calibration-confirm-row').style.display = 'none';
    document.getElementById('calibration-dots').style.display = 'flex';
  },

  handleTap(e) {
    if (this.corners.length >= 4) return;
    const x = e.clientX !== undefined ? e.clientX : e.offsetX;
    const y = e.clientY !== undefined ? e.clientY : e.offsetY;
    this.corners.push({ x, y });
    this.updateDots();
    this.draw();
    if (this.corners.length === 4) {
      this.showConfirm();
    }
  },

  updateDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById('dot-' + i);
      dot.className = 'dot-indicator';
      if (i < this.corners.length) dot.classList.add('done');
      else if (i === this.corners.length) dot.classList.add('active');
    }
  },

  showConfirm() {
    document.getElementById('calibration-confirm-row').style.display = 'flex';
    document.getElementById('calibration-dots').style.display = 'none';
    document.getElementById('calibration-instruction').textContent = 'Ser det bra ut?';
  },

  draw(video) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw camera frame as background
    if (video && video.readyState >= 2) {
      // Cover-fit: scale video to fill canvas maintaining aspect ratio
      const vw = video.videoWidth || w;
      const vh = video.videoHeight || h;
      const scale = Math.max(w / vw, h / vh);
      const sw = vw * scale;
      const sh = vh * scale;
      ctx.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh);
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, w, h);
    }

    if (this.corners.length === 0) return;

    // Draw corner dots
    this.corners.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#4caf50';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i + 1, c.x, c.y);
    });

    if (this.corners.length < 4) return;

    const [tl, tr, br, bl] = this.corners;

    // Court outline
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Net line (midpoint of top edge → midpoint of bottom edge)
    const netTop = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
    const netBot = { x: (bl.x + br.x) / 2, y: (bl.y + br.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(netTop.x, netTop.y);
    ctx.lineTo(netBot.x, netBot.y);
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Team labels
    const midA = {
      x: (tl.x + bl.x + netTop.x + netBot.x) / 4,
      y: (tl.y + bl.y + netTop.y + netBot.y) / 4,
    };
    const midB = {
      x: (tr.x + br.x + netTop.x + netBot.x) / 4,
      y: (tr.y + br.y + netTop.y + netBot.y) / 4,
    };

    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(App.nameA, midA.x, midA.y);
    ctx.fillText(App.nameB, midB.x, midB.y);
  },
};

function redoCalibration() {
  localStorage.removeItem(CalibrationModule.STORAGE_KEY);
  CalibrationModule.reset();
}

function confirmCalibration() {
  CalibrationModule.stop();
  const corners = CalibrationModule.corners;
  localStorage.setItem(CalibrationModule.STORAGE_KEY, JSON.stringify(corners));
  CourtModule.setCorners(corners);
  startMatch();
}

// ============================================================
// COURT MODULE
// ============================================================

const CourtModule = {
  corners: null,
  netTop: null,
  netBot: null,

  setCorners(corners) {
    this.corners = corners;
    const [tl, tr, br, bl] = corners;
    this.netTop = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
    this.netBot = { x: (bl.x + br.x) / 2, y: (bl.y + br.y) / 2 };
  },

  // Returns 'a' or 'b' for which side a point (x,y) is on
  // 'a' side = left of net line (Team A's half) → Team B scores
  determineSide(x, y) {
    if (!this.netTop) return null;
    const { netTop: nt, netBot: nb } = this;
    // Cross product of net direction vector and (point - netTop)
    const cross = (nb.x - nt.x) * (y - nt.y) - (nb.y - nt.y) * (x - nt.x);
    // cross > 0 means point is to the left (Team A side), so Team B scores
    // We return which side the shuttle LANDED ON (the loser's side)
    return cross > 0 ? 'a' : 'b';
  },

  // Scale analysis canvas coords (320x180) to screen coords
  scalePoint(x, y, analysisW, analysisH) {
    return {
      x: x * (window.innerWidth / analysisW),
      y: y * (window.innerHeight / analysisH),
    };
  },
};

// ============================================================
// SCORE MODULE
// ============================================================

const ScoreModule = {
  sets: [],           // [{a: 21, b: 18}, ...]
  current: { a: 0, b: 0 },
  setsWon: { a: 0, b: 0 },
  history: [],        // for undo

  reset() {
    this.sets = [];
    this.current = { a: 0, b: 0 };
    this.setsWon = { a: 0, b: 0 };
    this.history = [];
  },

  // landingSide: 'a' or 'b' — the side the shuttle landed on
  // The OPPONENT of the landing side gets the point
  awardPoint(landingSide) {
    const winner = landingSide === 'a' ? 'b' : 'a';
    this.history.push(JSON.parse(JSON.stringify({ sets: this.sets, current: this.current, setsWon: this.setsWon })));
    this.current[winner]++;
    UIModule.updateScore();
    UIModule.flashPoint(winner);

    if (this.isSetOver()) {
      setTimeout(() => this.endSet(), 600);
    }
  },

  // Manual +1 for a specific team (by team key 'a' or 'b')
  manualPoint(team) {
    this.history.push(JSON.parse(JSON.stringify({ sets: this.sets, current: this.current, setsWon: this.setsWon })));
    this.current[team]++;
    UIModule.updateScore();
    UIModule.flashPoint(team);
    AudioModule.playPointBeep();
    AudioModule.playApplause();

    if (this.isSetOver()) {
      setTimeout(() => this.endSet(), 600);
    }
  },

  undo() {
    if (this.history.length === 0) return;
    const prev = this.history.pop();
    this.sets = prev.sets;
    this.current = prev.current;
    this.setsWon = prev.setsWon;
    UIModule.updateScore();
  },

  isSetOver() {
    const { a, b } = this.current;
    const max = Math.max(a, b);
    const min = Math.min(a, b);
    if (max < 21) return false;
    if (max === 29) return true;      // Hard cap: 30-29
    return max >= 21 && max - min >= 2;
  },

  getSetWinner() {
    return this.current.a > this.current.b ? 'a' : 'b';
  },

  endSet() {
    const winner = this.getSetWinner();
    const loser = winner === 'a' ? 'b' : 'a';
    this.sets.push({ ...this.current });
    this.setsWon[winner]++;

    AudioModule.playSetWinBeep();

    const winnerName = winner === 'a' ? App.nameA : App.nameB;
    document.getElementById('setover-winner').textContent = winnerName + ' vinner setet';
    document.getElementById('setover-score').textContent = this.current.a + ' – ' + this.current.b;

    this.current = { a: 0, b: 0 };

    if (this.setsWon[winner] >= 2) {
      showScreen('setover');
      setTimeout(() => showGameOver(winner), 3000);
    } else {
      showScreen('setover');
      setTimeout(() => {
        showScreen('match');
        UIModule.updateScore();
      }, 3000);
    }
  },
};

function showGameOver(winner) {
  const winnerName = winner === 'a' ? App.nameA : App.nameB;
  document.getElementById('gameover-winner').textContent = winnerName + ' vinner matchen! 🏆';

  const setsHtml = ScoreModule.sets.map((s, i) => {
    const setWinner = s.a > s.b ? 'a' : 'b';
    return '<div class="gameover-set-row">' +
      '<span>Set ' + (i + 1) + '</span>' +
      '<span>' +
        (setWinner === 'a' ? '<span class="winner-score">' + s.a + '</span> – ' + s.b : s.a + ' – <span class="winner-score">' + s.b + '</span>') +
      '</span>' +
      '</div>';
  }).join('');
  document.getElementById('gameover-sets').innerHTML = setsHtml;

  showScreen('gameover');
}

function newGame() {
  ScoreModule.reset();
  DetectionModule.stop();
  RallyFSM.reset();
  showScreen('setup');
}

// ============================================================
// UI MODULE
// ============================================================

const UIModule = {
  updateScore() {
    const { a, b } = ScoreModule.current;
    document.getElementById('score-a').textContent = a;
    document.getElementById('score-b').textContent = b;
    document.getElementById('score-a').classList.toggle('leading', a > b);
    document.getElementById('score-b').classList.toggle('leading', b > a);

    document.getElementById('name-display-a').textContent = App.nameA;
    document.getElementById('name-display-b').textContent = App.nameB;

    // Set label
    const setNum = ScoreModule.sets.length + 1;
    document.getElementById('match-set-label').textContent = 'SET ' + setNum;

    // Set score dots
    const dotsEl = document.getElementById('set-scores');
    let dotsHtml = '';
    for (let i = 0; i < 3; i++) {
      const s = ScoreModule.sets[i];
      let cls = 'set-dot';
      let content = i + 1;
      if (s) {
        const w = s.a > s.b ? 'a' : 'b';
        cls += w === 'a' ? ' won-a' : ' won-b';
        content = s.a + '-' + s.b;
      }
      dotsHtml += '<div class="' + cls + '">' + content + '</div>';
    }
    dotsEl.innerHTML = dotsHtml;
  },

  flashPoint(team) {
    const el = document.getElementById('half-' + team);
    el.classList.remove('flash-point');
    void el.offsetWidth; // reflow to restart animation
    el.classList.add('flash-point');
  },

  setRallyState(state) {
    // state: 'idle' | 'in-play' | 'landed'
    const dot = document.getElementById('rally-dot');
    const label = document.getElementById('rally-label');
    dot.className = 'rally-dot';
    if (state === 'in-play') {
      dot.classList.add('in-play');
      label.textContent = 'Rall pågår';
    } else if (state === 'landed') {
      dot.classList.add('landed');
      label.textContent = 'Landning';
    } else {
      label.textContent = 'Väntar';
    }
  },
};

// ============================================================
// AUDIO MODULE
// ============================================================

const AudioModule = {
  ctx: null,

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  },

  playPointBeep() {
    if (!this.ctx || !App.soundEnabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    osc.frequency.setValueAtTime(1100, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.4);
  },

  playApplause() {
    if (!this.ctx || !App.applauseEnabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const t0 = this.ctx.currentTime + (App.soundEnabled ? 0.45 : 0);
    const totalDur = 2.8;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(2, Math.floor(sr * totalDur), sr);

    // Simulate 35 people each clapping at their own rate and phase.
    // Each clap = very fast attack + short noise decay (realistic hand-clap shape).
    for (let person = 0; person < 35; person++) {
      const rate = 2.8 + Math.random() * 1.6;     // 2.8–4.4 claps/sec
      const phase = Math.random();                  // random start offset
      const vol = 0.06 + Math.random() * 0.06;     // slight volume variation per person

      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        // Tiny L/R delay per person for stereo width
        const chOffset = ch === 0 ? 0 : Math.floor(Math.random() * 0.004 * sr);

        let t = phase / rate;
        while (t < totalDur) {
          const start = Math.floor(t * sr) + chOffset;
          const clapLen = Math.floor((0.018 + Math.random() * 0.030) * sr);
          for (let j = 0; j < clapLen; j++) {
            const idx = start + j;
            if (idx >= buf.length) break;
            // Two-stage envelope: sharp transient crack + short body decay
            const crack = Math.exp(-j / (sr * 0.003));
            const body  = Math.exp(-j / (sr * 0.018));
            data[idx] += (Math.random() * 2 - 1) * (crack * 0.6 + body * 0.4) * vol;
          }
          // Next clap with slight human timing jitter
          t += 1 / rate + (Math.random() - 0.5) * 0.06;
        }
      }
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buf;

    // Highpass: cut low rumble below 500 Hz
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 500;

    // High shelf: boost crisp presence in 2.5 kHz+ range
    const hs = this.ctx.createBiquadFilter();
    hs.type = 'highshelf';
    hs.frequency.value = 2500;
    hs.gain.value = 7;

    // Gain envelope: strong start, fade out last 40%
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.9, t0);
    gain.gain.setValueAtTime(0.9, t0 + totalDur * 0.55);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + totalDur);

    source.connect(hp);
    hp.connect(hs);
    hs.connect(gain);
    gain.connect(this.ctx.destination);
    source.start(t0);
    source.stop(t0 + totalDur + 0.1);
  },

  playSetWinBeep() {
    if (!this.ctx || !App.soundEnabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    [0, 0.18, 0.36].forEach((delay, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 660 + i * 220;
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + 0.22);
      osc.start(this.ctx.currentTime + delay);
      osc.stop(this.ctx.currentTime + delay + 0.22);
    });
  },
};

// ============================================================
// DETECTION MODULE
// ============================================================

const DetectionModule = {
  running: false,
  rafId: null,
  canvas: null,
  ctx: null,
  prevPixels: null,
  lastProcessTime: 0,
  PROCESS_INTERVAL: 50,   // ~20fps analysis
  AW: 320,
  AH: 180,

  init() {
    this.canvas = document.getElementById('analysis-canvas');
    this.canvas.width = this.AW;
    this.canvas.height = this.AH;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.prevPixels = null;
    this.running = true;
    this.loop(0);
  },

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  },

  loop(timestamp) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame((t) => this.loop(t));

    if (timestamp - this.lastProcessTime < this.PROCESS_INTERVAL) return;
    this.lastProcessTime = timestamp;

    const video = document.getElementById('camera-video');
    if (video.readyState < 2) return;

    this.ctx.drawImage(video, 0, 0, this.AW, this.AH);
    const frame = this.ctx.getImageData(0, 0, this.AW, this.AH);
    const pixels = frame.data;

    if (this.prevPixels) {
      const result = this.processFrame(pixels, this.prevPixels);
      if (result) {
        RallyFSM.update(result);
      } else {
        RallyFSM.update(null);
      }
    }

    // Store current as grayscale for next frame
    this.prevPixels = this.toGrayscale(pixels);
  },

  toGrayscale(pixels) {
    const gray = new Uint8Array(this.AW * this.AH);
    for (let i = 0; i < gray.length; i++) {
      const p = i * 4;
      gray[i] = (pixels[p] * 77 + pixels[p+1] * 150 + pixels[p+2] * 29) >> 8;
    }
    return gray;
  },

  processFrame(pixels, prevGray) {
    const W = this.AW;
    const H = this.AH;
    const THRESHOLD = 25;
    const CELL = 8;
    const cols = Math.floor(W / CELL);
    const rows = Math.floor(H / CELL);

    // Compute frame diff + cell motion grid
    const cells = new Uint8Array(cols * rows);
    let totalBrightSum = 0;

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        let diffSum = 0;
        let brightSum = 0;
        let count = 0;
        for (let dy = 0; dy < CELL; dy++) {
          for (let dx = 0; dx < CELL; dx++) {
            const px = cx * CELL + dx;
            const py = cy * CELL + dy;
            if (px >= W || py >= H) continue;
            const i = py * W + px;
            const pi = i * 4;
            const gray = (pixels[pi] * 77 + pixels[pi+1] * 150 + pixels[pi+2] * 29) >> 8;
            diffSum += Math.abs(gray - prevGray[i]);
            brightSum += pixels[pi]; // red channel as brightness proxy (shuttle is white)
            count++;
          }
        }
        totalBrightSum += brightSum / count;
        const avgDiff = count > 0 ? diffSum / count : 0;
        if (avgDiff > THRESHOLD) {
          cells[cy * cols + cx] = 1;
        }
      }
    }

    // Find motion blobs via BFS
    const blobs = this.findBlobs(cells, cols, rows, CELL, pixels, W);

    if (blobs.length === 0) return null;

    // Pick best candidate: smallest bright moving blob inside court boundary
    const candidate = this.selectCandidate(blobs, pixels, W, H);
    return candidate;
  },

  findBlobs(cells, cols, rows, cellSize, pixels, imgW) {
    const visited = new Uint8Array(cols * rows);
    const blobs = [];

    for (let i = 0; i < cells.length; i++) {
      if (!cells[i] || visited[i]) continue;
      // BFS
      const queue = [i];
      visited[i] = 1;
      let minCx = Infinity, maxCx = -Infinity;
      let minCy = Infinity, maxCy = -Infinity;
      let size = 0;

      while (queue.length > 0) {
        const idx = queue.shift();
        const cx = idx % cols;
        const cy = Math.floor(idx / cols);
        minCx = Math.min(minCx, cx); maxCx = Math.max(maxCx, cx);
        minCy = Math.min(minCy, cy); maxCy = Math.max(maxCy, cy);
        size++;

        // 4-connected neighbours
        const neighbours = [
          idx - 1, idx + 1, idx - cols, idx + cols,
        ];
        for (const n of neighbours) {
          if (n < 0 || n >= cells.length) continue;
          const nx = n % cols;
          const ny = Math.floor(n / cols);
          if (Math.abs(nx - (idx % cols)) > 1) continue; // wrap guard
          if (!visited[n] && cells[n]) {
            visited[n] = 1;
            queue.push(n);
          }
        }
      }

      // Filter by size (2–50 cells for shuttle; players are larger)
      if (size < 2 || size > 50) continue;

      const centerX = ((minCx + maxCx) / 2 + 0.5) * cellSize;
      const centerY = ((minCy + maxCy) / 2 + 0.5) * cellSize;

      // Brightness at blob center
      const brightness = this.sampleBrightness(pixels, imgW, centerX, centerY, 6);

      blobs.push({ centerX, centerY, size, brightness });
    }

    return blobs;
  },

  sampleBrightness(pixels, imgW, cx, cy, radius) {
    let sum = 0; let count = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const px = Math.round(cx + dx);
        const py = Math.round(cy + dy);
        if (px < 0 || py < 0 || px >= imgW) continue;
        const idx = (py * imgW + px) * 4;
        sum += (pixels[idx] + pixels[idx+1] + pixels[idx+2]) / 3;
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  },

  selectCandidate(blobs, pixels, W, H) {
    // Prefer: bright (white shuttle) + small + inside court
    const MIN_BRIGHTNESS = 140;
    const bright = blobs.filter(b => b.brightness >= MIN_BRIGHTNESS);
    const pool = bright.length > 0 ? bright : blobs;

    // Sort by size (smallest first = shuttle, not player)
    pool.sort((a, b) => a.size - b.size);

    // Scale to screen coords for court boundary check (optional, skip for simplicity)
    return pool[0] || null;
  },
};

// ============================================================
// RALLY STATE MACHINE
// ============================================================

const FLIGHT_VEL_THRESHOLD = 5; // px/frame at analysis resolution, min speed to count as "in flight"
const MIN_IN_PLAY_FRAMES = 2;
const COOLDOWN_MS = 5000;

const RallyFSM = {
  state: 'IDLE',
  positions: [],
  velocities: [],
  inPlayFrames: 0,
  cooldownUntil: 0,

  reset() {
    this.state = 'IDLE';
    this.positions = [];
    this.velocities = [];
    this.inPlayFrames = 0;
    this.cooldownUntil = 0;
    UIModule.setRallyState('idle');
  },

  update(blob) {
    const now = Date.now();
    if (now < this.cooldownUntil) return;

    switch (this.state) {
      case 'IDLE':
        if (blob && blob.brightness >= 140) {
          this.positions = [{ x: blob.centerX, y: blob.centerY, t: now }];
          this.velocities = [];
          this.inPlayFrames = 1;
          this.state = 'IN_PLAY';
          UIModule.setRallyState('in-play');
        }
        break;

      case 'IN_PLAY':
        if (blob && blob.brightness >= 140) {
          const prev = this.positions[this.positions.length - 1];
          const dt = Math.max(1, now - prev.t) / 16.67;
          const vx = (blob.centerX - prev.x) / dt;
          const vy = (blob.centerY - prev.y) / dt;
          const mag = Math.sqrt(vx * vx + vy * vy);

          this.positions.push({ x: blob.centerX, y: blob.centerY, t: now });
          this.velocities.push(mag);
          this.inPlayFrames++;

          if (this.positions.length > 10) this.positions.shift();
          if (this.velocities.length > 8) this.velocities.shift();

          // Deceleration landing detection
          if (this.velocities.length >= 4 && this.inPlayFrames >= MIN_IN_PLAY_FRAMES) {
            const recent = mag;
            const prevAvg = this.velocities.slice(-4, -1).reduce((s, v) => s + v, 0) / 3;
            if (prevAvg >= FLIGHT_VEL_THRESHOLD && recent < prevAvg * 0.3) {
              this.triggerLanding(blob.centerX, blob.centerY);
            }
          }
        } else {
          // Blob disappeared
          if (this.inPlayFrames >= MIN_IN_PLAY_FRAMES && this.velocities.length >= 2) {
            const recentVel = this.velocities[this.velocities.length - 1] || 0;
            if (recentVel >= FLIGHT_VEL_THRESHOLD) {
              const last = this.positions[this.positions.length - 1];
              if (last) this.triggerLanding(last.x, last.y);
              return;
            }
          }
          this.state = 'IDLE';
          UIModule.setRallyState('idle');
          this.positions = [];
          this.velocities = [];
          this.inPlayFrames = 0;
        }
        break;
    }
  },

  triggerLanding(x, y) {
    this.state = 'IDLE';
    UIModule.setRallyState('landed');
    this.cooldownUntil = Date.now() + COOLDOWN_MS;
    this.positions = [];
    this.velocities = [];
    this.inPlayFrames = 0;

    // Scale analysis coords to screen coords
    const screenPt = CourtModule.scalePoint(x, y, DetectionModule.AW, DetectionModule.AH);
    const side = CourtModule.determineSide(screenPt.x, screenPt.y);

    if (side) {
      ScoreModule.awardPoint(side);
      AudioModule.playPointBeep();
      AudioModule.playApplause();
    }

    setTimeout(() => UIModule.setRallyState('idle'), 800);
  },
};

// ============================================================
// MANUAL CONTROLS
// ============================================================

let longPressTimer = null;
let longPressTeam = null;

function startLongPress(team) {
  longPressTeam = team;
  longPressTimer = setTimeout(() => {
    ScoreModule.manualPoint(team);
    longPressTimer = null;
  }, 600);
}

function endLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function undoPoint() {
  ScoreModule.undo();
}

// ============================================================
// MATCH START / PAUSE
// ============================================================

function startMatch() {
  ScoreModule.reset();
  UIModule.updateScore();
  showScreen('match');
  DetectionModule.init();
}

function pauseMatch() {
  DetectionModule.stop();
  // Simple confirm dialog (native, blocks browser) so we avoid the pattern — use in-app
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;z-index:100;';
  el.innerHTML = '<div style="font-size:20px;font-weight:700;">Paus</div>' +
    '<button onclick="resumeMatch(this.parentNode)" style="padding:14px 32px;background:#fff;color:#000;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;">Fortsätt</button>' +
    '<button onclick="newGame()" style="padding:12px 24px;background:transparent;color:#888;border:1px solid #333;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">Ny match</button>';
  document.body.appendChild(el);
}

function resumeMatch(overlay) {
  overlay.remove();
  DetectionModule.init();
}

// ============================================================
// INIT
// ============================================================

// Prevent double-tap zoom on iOS
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

// Show "Add to Home Screen" hint if not already in standalone mode
const isStandalone = window.navigator.standalone === true
  || window.matchMedia('(display-mode: standalone)').matches;
if (!isStandalone) {
  document.getElementById('homescreen-banner').style.display = 'block';
}
