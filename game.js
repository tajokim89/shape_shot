// Shape Types & Colors
const ShapeType = { RECT: "RECT", CIRCLE: "CIRCLE", TRIANGLE: "TRIANGLE" };
const ColorType = { RED: "RED", GREEN: "GREEN", BLUE: "BLUE" };

const COLORS = [
  { type: ColorType.RED, label: "RED", hex: "#ff5f5f" },
  { type: ColorType.GREEN, label: "GREEN", hex: "#3dd598" },
  { type: ColorType.BLUE, label: "BLUE", hex: "#4a7fff" },
];

const COLOR_ORDER = COLORS.map((c) => c.type);
const COLOR_MAP = Object.fromEntries(COLORS.map((c) => [c.type, c]));

const SLOT_BLUEPRINT = [
  { id: 1, shape: ShapeType.RECT, bonusColor: ColorType.RED },
  { id: 2, shape: ShapeType.CIRCLE, bonusColor: ColorType.GREEN },
  { id: 3, shape: ShapeType.TRIANGLE, bonusColor: ColorType.BLUE },
];

// Game Constants
const CONFIG = {
  tokenRadius: 32,
  minSwipeDistance: 22,
  tapDistance: 8,
  tapTime: 240,
  speedScale: 1.7,
  maxInitialSpeed: 1200,
  stopSpeed: 35,
  stopDelay: 0.35,
  bounceFactor: 0.75,
  dampingPerSecond: 0.5,
  matchCoverage: 0.7,
  coverageSlices: 15,
  comboWindow: 3000,
  roundDuration: 60000,
  minThrowSpeed: 250,
  minVerticalSpeed: 200,
};

const SCORE = { base: 100, bonus: 150, miss: 50, comboBonus: 40, milestone: 200 };

// DOM Elements
const $ = (id) => document.getElementById(id);
const canvas = $("play-canvas");
const ctx = canvas.getContext("2d");
const dom = {
  score: $("score-value"),
  combo: $("combo-value"),
  comboTimer: $("combo-timer"),
  time: $("time-value"),
  status: $("status-message"),
  gameOver: $("game-over"),
  intro: $("game-intro"),
  finalScore: $("final-score"),
  finalCombo: $("final-combo"),
  resetBtn: $("reset-button"),
  restartBtn: $("restart-button"),
  startBtn: $("start-button"),
};

// Game State
const state = {
  worldWidth: canvas.width,
  worldHeight: canvas.height,
  pixelRatio: window.devicePixelRatio || 1,
  token: null,
  score: 0,
  combo: 0,
  bestCombo: 0,
  lastComboTime: 0,
  timeRemaining: CONFIG.roundDuration,
  gameOver: false,
  gameStarted: false,
  lastFrame: 0,
  statusTimer: null,
};

const pointer = {
  active: false,
  id: null,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  startTime: 0,
  moved: false,
};

const slots = SLOT_BLUEPRINT.map((s) => ({
  ...s,
  area: { x: 0, y: 0, width: 0, height: 0 },
  flash: null,
  flashTimer: 0,
}));

// Utility Functions
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const randomShape = () => Object.values(ShapeType)[Math.floor(Math.random() * 3)];
const randomColorIndex = () => Math.floor(Math.random() * COLOR_ORDER.length);

function hexToRgba(hex, alpha) {
  const rgb = hex.replace("#", "");
  if (rgb.length !== 6) return hex;
  const r = parseInt(rgb.slice(0, 2), 16);
  const g = parseInt(rgb.slice(2, 4), 16);
  const b = parseInt(rgb.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

// Canvas Setup
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  state.pixelRatio = window.devicePixelRatio || 1;
  canvas.width = rect.width * state.pixelRatio;
  canvas.height = rect.height * state.pixelRatio;
  ctx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
  state.worldWidth = rect.width;
  state.worldHeight = rect.height;
  updateSlotAreas();
  if (state.token) {
    const r = state.token.radius;
    state.token.x = clamp(state.token.x, r, state.worldWidth - r);
    state.token.y = clamp(state.token.y, r, state.worldHeight - r);
  }
}

function updateSlotAreas() {
  const padding = 18;
  const height = Math.min(120, state.worldHeight * 0.2);
  const width = (state.worldWidth - padding * 2) / 3;
  slots.forEach((slot, i) => {
    slot.area = { x: padding + i * width, y: 14, width, height };
  });
}

// Token Management
function spawnToken() {
  if (!state.gameStarted || state.gameOver) return;
  const colorIndex = randomColorIndex();
  state.token = {
    shape: randomShape(),
    colorIndex,
    color: COLOR_ORDER[colorIndex],
    x: state.worldWidth / 2,
    y: state.worldHeight - CONFIG.tokenRadius - 18,
    vx: 0,
    vy: 0,
    moving: false,
    restTimer: 0,
    radius: CONFIG.tokenRadius,
  };
}

function cycleTokenColor() {
  const t = state.token;
  if (!t || t.moving) return;
  t.colorIndex = (t.colorIndex + 1) % COLOR_ORDER.length;
  t.color = COLOR_ORDER[t.colorIndex];
  showStatus(`색 변경: ${COLOR_MAP[t.color].label}`, "info", 600);
}

// UI Updates
function updateScore(delta) {
  state.score = Math.max(0, state.score + delta);
  dom.score.textContent = state.score;
}

function updateCombo(value) {
  state.combo = Math.max(0, value);
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  dom.combo.textContent = state.combo;
  updateComboTimer();
}

function updateComboTimer() {
  if (!dom.comboTimer) return;
  if (state.combo > 0 && state.lastComboTime) {
    const remaining = Math.max(0, CONFIG.comboWindow - (performance.now() - state.lastComboTime));
    dom.comboTimer.textContent = remaining > 0 ? `${(remaining / 1000).toFixed(1)}s` : "--";
  } else {
    dom.comboTimer.textContent = "--";
  }
}

function updateTimeDisplay() {
  if (!dom.time) return;
  const seconds = Math.max(0, Math.ceil(state.timeRemaining / 1000));
  dom.time.textContent = `${seconds}s`;
}

function showStatus(message, variant = "info", duration = 1200) {
  dom.status.textContent = message;
  dom.status.dataset.variant = variant;
  dom.status.classList.add("visible");
  if (state.statusTimer) clearTimeout(state.statusTimer);
  state.statusTimer = setTimeout(() => dom.status.classList.remove("visible"), duration);
}

// Game Control
function resetGame() {
  state.gameStarted = true;
  state.gameOver = false;
  state.timeRemaining = CONFIG.roundDuration;
  state.bestCombo = 0;
  state.score = 0;
  state.combo = 0;
  state.lastComboTime = 0;
  state.token = null;

  dom.score.textContent = "0";
  updateCombo(0);
  updateTimeDisplay();
  slots.forEach((s) => { s.flash = null; s.flashTimer = 0; });

  spawnToken();
  showStatus("새 도형! 탭으로 색을 바꾼 뒤 스와이프", "info");
  dom.gameOver.classList.remove("visible");
  dom.intro.classList.remove("visible");
}

function endGame() {
  if (state.gameOver) return;
  state.gameOver = true;
  state.lastComboTime = 0;
  state.token = null;
  updateComboTimer();
  updateTimeDisplay();
  showStatus("시간 종료! 다시 시작을 눌러요", "miss", 2200);
  dom.finalScore.textContent = state.score;
  dom.finalCombo.textContent = state.bestCombo;
  dom.gameOver.classList.add("visible");
}

// Input Handling
function getCanvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * state.worldWidth,
    y: ((e.clientY - rect.top) / rect.height) * state.worldHeight,
  };
}

function onPointerDown(e) {
  if (!state.gameStarted || state.gameOver || !state.token || state.token.moving || pointer.active) return;
  const pt = getCanvasPoint(e);
  const dist = Math.hypot(pt.x - state.token.x, pt.y - state.token.y);
  if (dist > state.token.radius + 12) return;

  pointer.active = true;
  pointer.id = e.pointerId;
  pointer.startX = pointer.lastX = pt.x;
  pointer.startY = pointer.lastY = pt.y;
  pointer.startTime = performance.now();
  pointer.moved = false;
  canvas.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  if (!pointer.active || e.pointerId !== pointer.id) return;
  const pt = getCanvasPoint(e);
  pointer.lastX = pt.x;
  pointer.lastY = pt.y;
  if (Math.hypot(pointer.lastX - pointer.startX, pointer.lastY - pointer.startY) > CONFIG.tapDistance) {
    pointer.moved = true;
  }
}

function onPointerUp(e) {
  if (!pointer.active || e.pointerId !== pointer.id) return;
  canvas.releasePointerCapture(e.pointerId);

  const duration = performance.now() - pointer.startTime;
  const dx = pointer.lastX - pointer.startX;
  const dy = pointer.lastY - pointer.startY;
  const distance = Math.hypot(dx, dy);

  if (!pointer.moved && duration < CONFIG.tapTime) {
    cycleTokenColor();
  } else if (distance >= CONFIG.minSwipeDistance && duration > 30) {
    launchToken(dx, dy, duration);
  } else {
    cycleTokenColor();
  }
  pointer.active = false;
}

function onPointerCancel(e) {
  if (!pointer.active || e.pointerId !== pointer.id) return;
  pointer.active = false;
  canvas.releasePointerCapture(e.pointerId);
}

// Physics
function launchToken(dx, dy, durationMs) {
  const t = state.token;
  if (!t) return;

  const len = Math.max(Math.hypot(dx, dy), 1);
  const speed = clamp((len / durationMs) * CONFIG.speedScale * 1000, 120, CONFIG.maxInitialSpeed);
  t.vx = (dx / len) * speed;
  t.vy = (dy / len) * speed;

  if (speed < CONFIG.minThrowSpeed || t.vy > -CONFIG.minVerticalSpeed) {
    t.moving = false;
    handleMiss(null, "던지는 힘이 너무 약했어요!");
    return;
  }
  t.moving = true;
  t.restTimer = 0;
  showStatus("던짐! 벽에 부딪히면 튕겨요", "info", 800);
}

function handleBoundaryBounce(t) {
  const { radius } = t;
  const bounds = { left: radius, right: state.worldWidth - radius, top: radius, bottom: state.worldHeight - radius };

  if (t.x < bounds.left) { t.x = bounds.left; t.vx *= -CONFIG.bounceFactor; }
  else if (t.x > bounds.right) { t.x = bounds.right; t.vx *= -CONFIG.bounceFactor; }

  if (t.y < bounds.top) { t.y = bounds.top; t.vy *= -CONFIG.bounceFactor; }
  else if (t.y > bounds.bottom) { t.y = bounds.bottom; t.vy *= -CONFIG.bounceFactor; }
}

// Collision Detection
function circleCoverageInRect(circle, rect) {
  const { radius: r, x: cx, y: cy } = circle;
  if (r <= 0) return 0;

  const n = CONFIG.coverageSlices;
  let inside = 0, total = 0;

  for (let yi = 0; yi < n; yi++) {
    const oy = -r + (2 * r * yi) / (n - 1);
    for (let xi = 0; xi < n; xi++) {
      const ox = -r + (2 * r * xi) / (n - 1);
      if (ox * ox + oy * oy <= r * r) {
        total++;
        const sx = cx + ox, sy = cy + oy;
        if (sx >= rect.x && sx <= rect.x + rect.width && sy >= rect.y && sy <= rect.y + rect.height) {
          inside++;
        }
      }
    }
  }
  return total ? inside / total : 0;
}

function findMatchingSlot(token) {
  let best = null;
  for (const slot of slots) {
    const coverage = circleCoverageInRect({ radius: token.radius, x: token.x, y: token.y }, slot.area);
    if (coverage >= CONFIG.matchCoverage && (!best || coverage > best.coverage)) {
      best = { slot, coverage };
    }
  }
  return best;
}

// Scoring
function flashSlot(slot, type) {
  if (!slot) return;
  slot.flash = type;
  slot.flashTimer = 0.45;
}

function handleMiss(slot, message) {
  flashSlot(slot, "miss");
  showStatus(message || "MISS! 슬롯과 도형이 맞지 않아요", "miss");
  updateScore(-SCORE.miss);
  state.lastComboTime = 0;
  updateCombo(0);
  finishRound();
}

function handleBasicSuccess(slot) {
  flashSlot(slot, "success");
  updateScore(SCORE.base);
  state.lastComboTime = 0;
  updateCombo(0);
  showStatus("도형만 일치! +100", "success");
  finishRound();
}

function handleBonus(slot) {
  flashSlot(slot, "bonus");
  const now = performance.now();
  const withinWindow = state.combo > 0 && state.lastComboTime && now - state.lastComboTime <= CONFIG.comboWindow;
  state.lastComboTime = now;

  const nextCombo = withinWindow ? state.combo + 1 : 1;
  updateCombo(nextCombo);

  let gained = SCORE.base + SCORE.bonus + state.combo * SCORE.comboBonus;
  const milestoneBonus = (state.combo > 0 && state.combo % 3 === 0) ? SCORE.milestone : 0;
  gained += milestoneBonus;
  updateScore(gained);

  const milestoneText = milestoneBonus ? ` +${milestoneBonus} 보너스!` : "";
  showStatus(`색까지 완벽! x${state.combo} 콤보${milestoneText}`, "bonus");
  finishRound();
}

function resolveSlotOutcome(slot) {
  const t = state.token;
  if (!t) return;
  t.moving = false;
  t.vx = t.vy = 0;

  if (slot.shape !== t.shape) handleMiss(slot);
  else if (t.color === slot.bonusColor) handleBonus(slot);
  else handleBasicSuccess(slot);
}

function finishRound() {
  state.token = null;
  if (!state.gameOver) spawnToken();
}

// Game Loop
function update(delta) {
  // Update slot flash timers
  for (const slot of slots) {
    if (slot.flashTimer > 0) {
      slot.flashTimer -= delta;
      if (slot.flashTimer <= 0) { slot.flash = null; slot.flashTimer = 0; }
    }
  }

  // Update game timer
  if (state.gameStarted && !state.gameOver) {
    state.timeRemaining = Math.max(0, state.timeRemaining - delta * 1000);
    updateTimeDisplay();
    if (state.timeRemaining <= 0) { endGame(); return; }
  }

  // Enforce combo window
  if (!state.gameOver && state.combo > 0 && state.lastComboTime) {
    if (performance.now() - state.lastComboTime > CONFIG.comboWindow) {
      state.lastComboTime = 0;
      updateCombo(0);
    }
  }
  updateComboTimer();

  // Physics update
  const t = state.token;
  if (!t || !t.moving || state.gameOver) return;

  t.x += t.vx * delta;
  t.y += t.vy * delta;
  const damping = Math.pow(CONFIG.dampingPerSecond, delta);
  t.vx *= damping;
  t.vy *= damping;

  handleBoundaryBounce(t);

  // Check for mid-air match
  const match = findMatchingSlot(t);
  if (match) { resolveSlotOutcome(match.slot); return; }

  // Check if stopped
  const speed = Math.hypot(t.vx, t.vy);
  t.restTimer = speed < CONFIG.stopSpeed ? t.restTimer + delta : 0;

  if (t.restTimer > CONFIG.stopDelay) {
    t.moving = false;
    t.vx = t.vy = 0;
    const finalMatch = findMatchingSlot(t);
    if (finalMatch) resolveSlotOutcome(finalMatch.slot);
    else handleMiss();
  }
}

// Rendering
function draw() {
  ctx.clearRect(0, 0, state.worldWidth, state.worldHeight);
  drawSlots();
  drawSpawnZone();
  if (state.token) drawToken(state.token);
}

function drawSlots() {
  for (const slot of slots) {
    const { x, y, width, height } = slot.area;
    ctx.save();
    ctx.beginPath();
    roundedRectPath(ctx, x, y, width, height, 18);
    ctx.fillStyle = `rgba(255,255,255,${slot.flash === "bonus" ? 0.15 : 0.05})`;
    ctx.fill();
    ctx.lineWidth = slot.flash ? 3 : 1.5;
    ctx.strokeStyle = slot.flash === "miss" ? "rgba(255,105,105,0.8)"
      : slot.flash === "success" ? "rgba(255,255,255,0.55)"
      : slot.flash === "bonus" ? COLOR_MAP[slot.bonusColor].hex
      : "rgba(255,255,255,0.18)";
    ctx.stroke();
    ctx.restore();

    const cx = x + width / 2, cy = y + height / 2 + 6;
    const size = Math.min(width, height) * 0.6;
    drawShape(slot.shape, cx, cy, size, COLOR_MAP[slot.bonusColor].hex, { fillAlpha: 0.35, borderAlpha: 0.35 });
  }
}

function drawSpawnZone() {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(30, state.worldHeight - 50);
  ctx.lineTo(state.worldWidth - 30, state.worldHeight - 50);
  ctx.stroke();
  ctx.restore();
}

function drawToken(t) {
  drawShape(t.shape, t.x, t.y, t.radius * 2.1, COLOR_MAP[t.color].hex, { shadow: true, fillAlpha: 1, borderAlpha: 0.9 });
}

function roundedRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawShape(shape, x, y, size, color, opts = {}) {
  const { shadow = false, fillAlpha = 1, borderAlpha = 0.6 } = opts;
  ctx.save();
  if (shadow) { ctx.shadowColor = `${color}dd`; ctx.shadowBlur = 20; }
  ctx.fillStyle = hexToRgba(color, fillAlpha);
  ctx.strokeStyle = `rgba(5, 8, 22, ${borderAlpha})`;
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  if (shape === ShapeType.RECT) {
    roundedRectPath(ctx, x - size / 2, y - size / 2, size, size, 12);
  } else if (shape === ShapeType.CIRCLE) {
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  } else if (shape === ShapeType.TRIANGLE) {
    ctx.moveTo(x, y - size / 2);
    ctx.lineTo(x + size / 2, y + size / 2);
    ctx.lineTo(x - size / 2, y + size / 2);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function loop(timestamp) {
  if (!state.lastFrame) state.lastFrame = timestamp;
  const delta = (timestamp - state.lastFrame) / 1000;
  state.lastFrame = timestamp;
  update(delta);
  draw();
  requestAnimationFrame(loop);
}

// Event Listeners
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerCancel);
window.addEventListener("resize", resizeCanvas);
dom.resetBtn.addEventListener("click", resetGame);
dom.restartBtn?.addEventListener("click", resetGame);
dom.startBtn?.addEventListener("click", resetGame);

// Mobile gesture prevention
window.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
window.addEventListener("touchstart", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
window.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 350) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// Initialize
resizeCanvas();
updateTimeDisplay();
updateComboTimer();
dom.intro.classList.add("visible");
requestAnimationFrame(loop);
