// 기본 타입 정의
const ShapeType = {
  RECT: "RECT",
  CIRCLE: "CIRCLE",
  TRIANGLE: "TRIANGLE",
};

const ColorType = {
  RED: "RED",
  GREEN: "GREEN",
  BLUE: "BLUE",
};

// 실제 색상/라벨 매핑
const COLORS = [
  { type: ColorType.RED, label: "RED", hex: "#ff5f5f" },
  { type: ColorType.GREEN, label: "GREEN", hex: "#3dd598" },
  { type: ColorType.BLUE, label: "BLUE", hex: "#4a7fff" },
];

const COLOR_ORDER = COLORS.map((entry) => entry.type);
const COLOR_MAP = COLORS.reduce((acc, color) => {
  acc[color.type] = color;
  return acc;
}, {});

const SLOT_BLUEPRINT = [
  { id: 1, shape: ShapeType.RECT, bonusColor: ColorType.RED },
  { id: 2, shape: ShapeType.CIRCLE, bonusColor: ColorType.GREEN },
  { id: 3, shape: ShapeType.TRIANGLE, bonusColor: ColorType.BLUE },
];

// 점수 규칙
const SCORE_RULE = {
  base: 100,
  bonus: 150,
  miss: 50,
  comboBonus: 40,
  milestone: 200, // extra points for combo milestones
};

const TOKEN_RADIUS = 32;
const MIN_SWIPE_DISTANCE = 22;
const TAP_DISTANCE = 8;
const TAP_TIME = 240;
const SPEED_SCALE = 1.7;
const MAX_INITIAL_SPEED = 1200;
const STOP_SPEED = 35;
const STOP_DELAY = 0.35;
const BOUNCE_FACTOR = 0.75;
const DAMPING_PER_SECOND = 0.5; // speed halves per second
const NEXT_TOKEN_DELAY = 300;
const MATCH_COVERAGE = 0.7;
const COVERAGE_SLICES = 15;
const COMBO_WINDOW = 3000; // ms allowed between bonus hits
const ROUND_DURATION = 60000; // 60 seconds per play session
const MIN_THROW_SPEED = 250; // px per second
const MIN_VERTICAL_SPEED = 200; // px per second upward required

// 캔버스 및 HUD 요소
const canvas = document.getElementById("play-canvas");
const ctx = canvas.getContext("2d");
const scoreValue = document.getElementById("score-value");
const comboValue = document.getElementById("combo-value");
const comboTimerValue = document.getElementById("combo-timer");
const timeValue = document.getElementById("time-value");
const resetButton = document.getElementById("reset-button");
const statusMessage = document.getElementById("status-message");
const gameOverLayer = document.getElementById("game-over");
const introLayer = document.getElementById("game-intro");
const finalScoreValue = document.getElementById("final-score");
const finalComboValue = document.getElementById("final-combo");
const restartButton = document.getElementById("restart-button");
const startButton = document.getElementById("start-button");

let worldWidth = canvas.width;
let worldHeight = canvas.height;
let pixelRatio = window.devicePixelRatio || 1;

// 렌더/판정용 슬롯 정보
const slots = SLOT_BLUEPRINT.map((slot) => ({
  ...slot,
  area: { x: 0, y: 0, width: 0, height: 0 },
  flash: null,
  flashTimer: 0,
}));

let activeToken = null;
let spawnTimer = null;
let score = 0;
let combo = 0;
let lastFrame = 0;
let statusTimer = null;
let lastComboTime = 0;
let timeRemaining = ROUND_DURATION;
let gameOver = false;
let bestCombo = 0;
let gameStarted = false;

// 현재 포인터(터치) 상태
const pointerState = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  startTime: 0,
  moved: false,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomShape() {
  const pool = Object.values(ShapeType);
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomColorIndex() {
  return Math.floor(Math.random() * COLOR_ORDER.length);
}

// 기기 회전/리사이즈 대응
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  pixelRatio = window.devicePixelRatio || 1;
  canvas.width = rect.width * pixelRatio;
  canvas.height = rect.height * pixelRatio;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  worldWidth = rect.width;
  worldHeight = rect.height;
  updateSlotAreas();
  if (activeToken) {
    const r = activeToken.radius;
    activeToken.position.x = clamp(activeToken.position.x, r, worldWidth - r);
    activeToken.position.y = clamp(activeToken.position.y, r, worldHeight - r);
  }
}

function updateSlotAreas() {
  const paddingX = 18;
  const gap = 0;
  const height = Math.min(120, worldHeight * 0.2);
  const width = (worldWidth - paddingX * 2 - gap * 2) / 3;
  slots.forEach((slot, index) => {
    slot.area.x = paddingX + index * (width + gap);
    slot.area.y = 14;
    slot.area.width = width;
    slot.area.height = height;
  });
}

// 신규 토큰 생성
function spawnToken() {
  if (!gameStarted || gameOver) return;
  activeToken = {
    shape: randomShape(),
    colorIndex: randomColorIndex(),
    color: null,
    position: {
      x: worldWidth / 2,
      y: worldHeight - TOKEN_RADIUS - 18,
    },
    velocity: { x: 0, y: 0 },
    moving: false,
    restTimer: 0,
    radius: TOKEN_RADIUS,
  };
  activeToken.color = COLOR_ORDER[activeToken.colorIndex];
}

// 탭으로 색 순환
function cycleTokenColor() {
  if (!activeToken || activeToken.moving) return;
  activeToken.colorIndex = (activeToken.colorIndex + 1) % COLOR_ORDER.length;
  activeToken.color = COLOR_ORDER[activeToken.colorIndex];
  setStatus(`색 변경: ${COLOR_MAP[activeToken.color].label}`, "info", 600);
}

function updateScore(delta) {
  score = Math.max(0, score + delta);
  scoreValue.textContent = score;
}

function updateCombo(value) {
  combo = Math.max(0, value);
  comboValue.textContent = combo;
  bestCombo = Math.max(bestCombo, combo);
  updateComboTimerText();
}

function updateTimerDisplay() {
  if (!timeValue) return;
  const seconds = Math.max(0, Math.ceil(timeRemaining / 1000));
  timeValue.textContent = `${seconds}s`;
}

// 전체 상태 초기화
function resetGame() {
  gameStarted = true;
  if (spawnTimer) {
    clearTimeout(spawnTimer);
    spawnTimer = null;
  }
  gameOver = false;
  timeRemaining = ROUND_DURATION;
  bestCombo = 0;
  updateScore(-score);
  lastComboTime = 0;
  updateCombo(0);
  updateComboTimerText();
  updateTimerDisplay();
  slots.forEach((slot) => {
    slot.flash = null;
    slot.flashTimer = 0;
  });
  activeToken = null;
  spawnToken();
  setStatus("새 도형! 탭으로 색을 바꾼 뒤 스와이프", "info");
  hideGameOverDialog();
  hideIntroDialog();
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * worldWidth;
  const y = ((event.clientY - rect.top) / rect.height) * worldHeight;
  return { x, y };
}

// 토큰 잡기
function pointerDown(event) {
  if (
    !gameStarted ||
    gameOver ||
    !activeToken ||
    activeToken.moving ||
    pointerState.active
  )
    return;
  const point = getCanvasPoint(event);
  const dist = Math.hypot(
    point.x - activeToken.position.x,
    point.y - activeToken.position.y
  );
  if (dist > activeToken.radius + 12) return;

  pointerState.active = true;
  pointerState.pointerId = event.pointerId;
  pointerState.startX = point.x;
  pointerState.startY = point.y;
  pointerState.lastX = point.x;
  pointerState.lastY = point.y;
  pointerState.startTime = performance.now();
  pointerState.moved = false;
  canvas.setPointerCapture(event.pointerId);
}

// 스와이프 추적
function pointerMove(event) {
  if (!pointerState.active || event.pointerId !== pointerState.pointerId) return;
  const point = getCanvasPoint(event);
  pointerState.lastX = point.x;
  pointerState.lastY = point.y;
  const dist = Math.hypot(
    pointerState.lastX - pointerState.startX,
    pointerState.lastY - pointerState.startY
  );
  if (dist > TAP_DISTANCE) {
    pointerState.moved = true;
  }
}

// 탭/스와이프 판단
function pointerUp(event) {
  if (!pointerState.active || event.pointerId !== pointerState.pointerId) return;
  canvas.releasePointerCapture(event.pointerId);
  const duration = performance.now() - pointerState.startTime;
  const dx = pointerState.lastX - pointerState.startX;
  const dy = pointerState.lastY - pointerState.startY;
  const distance = Math.hypot(dx, dy);

  if (!pointerState.moved && duration < TAP_TIME) {
    cycleTokenColor();
  } else if (distance >= MIN_SWIPE_DISTANCE && duration > 30) {
    launchToken(dx, dy, duration);
  } else {
    cycleTokenColor();
  }

  pointerState.active = false;
}

function pointerCancel(event) {
  if (!pointerState.active || event.pointerId !== pointerState.pointerId) return;
  pointerState.active = false;
  canvas.releasePointerCapture(event.pointerId);
}

// 계산된 방향/속도 적용
function launchToken(dx, dy, durationMs) {
  if (!activeToken) return;
  const dirLength = Math.max(Math.hypot(dx, dy), 1);
  const dirX = dx / dirLength;
  const dirY = dy / dirLength;
  const pxPerMs = (dirLength / durationMs) * SPEED_SCALE;
  const speed = clamp(pxPerMs * 1000, 120, MAX_INITIAL_SPEED);
  activeToken.velocity.x = dirX * speed;
  activeToken.velocity.y = dirY * speed;
  const tooWeak =
    speed < MIN_THROW_SPEED || activeToken.velocity.y > -MIN_VERTICAL_SPEED;
  if (tooWeak) {
    handleWeakThrow();
    return;
  }
  activeToken.moving = true;
  activeToken.restTimer = 0;
  setStatus("던짐! 벽에 부딪히면 튕겨요", "info", 800);
}

// 프레임별 물리/판정
function update(delta) {
  slots.forEach((slot) => {
    if (slot.flashTimer > 0) {
      slot.flashTimer -= delta;
      if (slot.flashTimer <= 0) {
        slot.flash = null;
        slot.flashTimer = 0;
      }
    }
  });

  if (gameStarted && !gameOver) {
    timeRemaining = Math.max(0, timeRemaining - delta * 1000);
    updateTimerDisplay();
    if (timeRemaining <= 0) {
      endGame();
      return;
    }
  } else {
    updateTimerDisplay();
  }

  enforceComboWindow();

  if (!activeToken || !activeToken.moving || gameOver) return;
  const t = activeToken;
  t.position.x += t.velocity.x * delta;
  t.position.y += t.velocity.y * delta;

  const damping = Math.pow(DAMPING_PER_SECOND, delta);
  t.velocity.x *= damping;
  t.velocity.y *= damping;

  handleBoundaryBounce(t);

  const midAirMatch = findMatchingSlot(t);
  if (midAirMatch) {
    resolveSlotOutcome(midAirMatch.slot);
    return;
  }

  const speed = Math.hypot(t.velocity.x, t.velocity.y);
  if (speed < STOP_SPEED) {
    t.restTimer += delta;
  } else {
    t.restTimer = 0;
  }

  if (t.restTimer > STOP_DELAY) {
    t.moving = false;
    t.velocity.x = 0;
    t.velocity.y = 0;
    judgeTokenPosition();
  }
}

// 화면 경계 반사 처리
function handleBoundaryBounce(token) {
  const { radius } = token;
  const left = radius;
  const right = worldWidth - radius;
  const top = radius;
  const bottom = worldHeight - radius;

  if (token.position.x < left) {
    token.position.x = left;
    token.velocity.x *= -BOUNCE_FACTOR;
  } else if (token.position.x > right) {
    token.position.x = right;
    token.velocity.x *= -BOUNCE_FACTOR;
  }

  if (token.position.y < top) {
    token.position.y = top;
    token.velocity.y *= -BOUNCE_FACTOR;
  } else if (token.position.y > bottom) {
    token.position.y = bottom;
    token.velocity.y *= -BOUNCE_FACTOR;
  }
}

// 속도가 거의 0일 때 최종 판정
function judgeTokenPosition() {
  if (!activeToken) return;
  const bestMatch = findMatchingSlot(activeToken);
  if (!bestMatch) {
    handleMiss();
    return;
  }
  resolveSlotOutcome(bestMatch.slot);
}

// 실패 처리
function handleMiss(slot, message) {
  flashSlot(slot, "miss");
  setStatus(message || "MISS! 슬롯과 도형이 맞지 않아요", "miss");
  updateScore(-SCORE_RULE.miss);
  lastComboTime = 0;
  updateCombo(0);
  updateComboTimerText();
  finishRound();
}

function handleWeakThrow() {
  if (!activeToken) return;
  activeToken.moving = false;
  handleMiss(null, "던지는 힘이 너무 약했어요!");
}

// 도형만 일치
function handleBasicSuccess(slot) {
  flashSlot(slot, "success");
  updateScore(SCORE_RULE.base);
  lastComboTime = 0;
  updateCombo(0);
  updateComboTimerText();
  setStatus("도형만 일치! +100", "success");
  finishRound();
}

// 도형+색 일치
function handleBonus(slot) {
  flashSlot(slot, "bonus");
  const now = performance.now();
  const withinWindow =
    combo > 0 && lastComboTime && now - lastComboTime <= COMBO_WINDOW;
  lastComboTime = now;
  const nextCombo = withinWindow ? combo + 1 : 1;
  updateCombo(nextCombo);
  updateComboTimerText();
  let gained =
    SCORE_RULE.base + SCORE_RULE.bonus + combo * SCORE_RULE.comboBonus;
  let milestoneBonus = 0;
  if (combo > 0 && combo % 3 === 0) {
    milestoneBonus = SCORE_RULE.milestone;
  }
  gained += milestoneBonus;
  updateScore(gained);
  const milestoneText = milestoneBonus ? ` +${milestoneBonus} 보너스!` : "";
  setStatus(`색까지 완벽! x${combo} 콤보${milestoneText}`, "bonus");
  finishRound();
}

// 슬롯 하이라이트 상태
function flashSlot(slot, type) {
  if (!slot) return;
  slot.flash = type;
  slot.flashTimer = 0.45;
}

// 다음 라운드 예약
function finishRound() {
  activeToken = null;
  if (spawnTimer) clearTimeout(spawnTimer);
  if (gameOver) return;
  spawnToken();
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  lastComboTime = 0;
  updateComboTimerText();
  if (spawnTimer) {
    clearTimeout(spawnTimer);
    spawnTimer = null;
  }
  activeToken = null;
  updateTimerDisplay();
  setStatus("시간 종료! 다시 시작을 눌러요", "miss", 2200);
  showGameOverDialog();
}

// 토큰이 70% 이상 덮은 슬롯 찾기
function findMatchingSlot(token) {
  let bestMatch = null;
  slots.forEach((slot) => {
    const coverage = circleCoverageInRect(token, slot.area);
    if (coverage >= MATCH_COVERAGE) {
      if (!bestMatch || coverage > bestMatch.coverage) {
        bestMatch = { slot, coverage };
      }
    }
  });
  return bestMatch;
}

// 슬롯 판정 공통 처리
function resolveSlotOutcome(slot) {
  if (!activeToken) return;
  activeToken.moving = false;
  activeToken.velocity.x = 0;
  activeToken.velocity.y = 0;
  if (slot.shape !== activeToken.shape) {
    handleMiss(slot);
  } else if (activeToken.color === slot.bonusColor) {
    handleBonus(slot);
  } else {
    handleBasicSuccess(slot);
  }
}

// 원이 사각형을 덮은 비율 근사
function circleCoverageInRect(circle, rect) {
  const r = circle.radius;
  if (r <= 0) return 0;
  const divisions = COVERAGE_SLICES;
  let inside = 0;
  let total = 0;
  for (let yi = 0; yi < divisions; yi += 1) {
    const offsetY = -r + (2 * r * yi) / (divisions - 1);
    for (let xi = 0; xi < divisions; xi += 1) {
      const offsetX = -r + (2 * r * xi) / (divisions - 1);
      if (offsetX * offsetX + offsetY * offsetY <= r * r) {
        total += 1;
        const sampleX = circle.position.x + offsetX;
        const sampleY = circle.position.y + offsetY;
        if (
          sampleX >= rect.x &&
          sampleX <= rect.x + rect.width &&
          sampleY >= rect.y &&
          sampleY <= rect.y + rect.height
        ) {
          inside += 1;
        }
      }
    }
  }
  return total ? inside / total : 0;
}

// 메인 렌더 루프
function draw() {
  ctx.clearRect(0, 0, worldWidth, worldHeight);
  drawSlots();
  drawSpawnZone();
  if (activeToken) {
    drawToken(activeToken);
  }
}

// 슬롯 영역 렌더
function drawSlots() {
  slots.forEach((slot) => {
    const { x, y, width, height } = slot.area;
    ctx.save();
    ctx.beginPath();
    roundedRectPath(ctx, x, y, width, height, 18);
    const highlight = slot.flash === "bonus" ? 0.15 : 0.05;
    ctx.fillStyle = `rgba(255,255,255,${highlight})`;
    ctx.fill();
    ctx.lineWidth = slot.flash ? 3 : 1.5;
    let stroke = "rgba(255,255,255,0.18)";
    if (slot.flash === "miss") stroke = "rgba(255,105,105,0.8)";
    if (slot.flash === "success") stroke = "rgba(255,255,255,0.55)";
    if (slot.flash === "bonus") stroke = `${COLOR_MAP[slot.bonusColor].hex}`;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();

    const centerX = x + width / 2;
    const centerY = y + height / 2 + 6;
    const size = Math.min(width, height) * 0.6;
    drawShape(slot.shape, centerX, centerY, size, COLOR_MAP[slot.bonusColor].hex, {
      shadow: false,
      borderAlpha: 0.35,
      fillAlpha: 0.35,
    });
  });
}

// 하단 가이드 라인
function drawSpawnZone() {
  ctx.save();
  const baseline = worldHeight - 50;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(30, baseline);
  ctx.lineTo(worldWidth - 30, baseline);
  ctx.stroke();
  ctx.restore();
}

// 토큰 렌더
function drawToken(token) {
  const color = COLOR_MAP[token.color].hex;
  drawShape(token.shape, token.position.x, token.position.y, token.radius * 2.1, color, {
    shadow: true,
    borderAlpha: 0.9,
    fillAlpha: 1,
  });
}

// 공통 둥근 사각 라인
function roundedRectPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
}

// 실제 도형 렌더
function drawShape(shape, x, y, size, color, options = {}) {
  const { shadow = false, borderAlpha = 0.6, fillAlpha = 1 } = options;
  ctx.save();
  if (shadow) {
    ctx.shadowColor = `${color}dd`;
    ctx.shadowBlur = 20;
  }
  ctx.fillStyle = applyAlpha(color, fillAlpha);
  ctx.strokeStyle = `rgba(5, 8, 22, ${borderAlpha})`;
  ctx.lineWidth = 2.5;
  switch (shape) {
    case ShapeType.RECT: {
      ctx.beginPath();
      roundedRectPath(ctx, x - size / 2, y - size / 2, size, size, 12);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case ShapeType.CIRCLE: {
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case ShapeType.TRIANGLE: {
      ctx.beginPath();
      ctx.moveTo(x, y - size / 2);
      ctx.lineTo(x + size / 2, y + size / 2);
      ctx.lineTo(x - size / 2, y + size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

// HEX → rgba 변환
function applyAlpha(hexColor, alpha) {
  const normalized = clamp(alpha, 0, 1);
  const rgb = hexColor.replace("#", "");
  if (rgb.length !== 6) return hexColor;
  const r = parseInt(rgb.slice(0, 2), 16);
  const g = parseInt(rgb.slice(2, 4), 16);
  const b = parseInt(rgb.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${normalized})`;
}

// 상단 메시지 표출
function setStatus(message, variant = "info", duration = 1200) {
  statusMessage.textContent = message;
  statusMessage.dataset.variant = variant;
  statusMessage.classList.add("visible");
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusMessage.classList.remove("visible");
  }, duration);
}

// requestAnimationFrame 루프
function loop(timestamp) {
  if (!lastFrame) lastFrame = timestamp;
  const delta = (timestamp - lastFrame) / 1000;
  lastFrame = timestamp;
  update(delta);
  draw();
  requestAnimationFrame(loop);
}

// 콤보 유효시간 표시 및 만료 처리
function enforceComboWindow() {
  if (gameOver) {
    updateComboTimerText();
    return;
  }
  if (!combo || !lastComboTime) {
    updateComboTimerText();
    return;
  }
  const remaining = COMBO_WINDOW - (performance.now() - lastComboTime);
  if (remaining <= 0) {
    lastComboTime = 0;
    updateCombo(0);
    updateComboTimerText();
  } else if (comboTimerValue) {
    comboTimerValue.textContent = `${(remaining / 1000).toFixed(1)}s`;
  }
}

function updateComboTimerText() {
  if (!comboTimerValue) return;
  if (combo > 0 && lastComboTime) {
    const remaining = Math.max(
      0,
      COMBO_WINDOW - (performance.now() - lastComboTime)
    );
    comboTimerValue.textContent =
      remaining > 0 ? `${(remaining / 1000).toFixed(1)}s` : "--";
  } else {
    comboTimerValue.textContent = "--";
  }
}

function showGameOverDialog() {
  if (!gameOverLayer) return;
  if (finalScoreValue) finalScoreValue.textContent = score;
  if (finalComboValue) finalComboValue.textContent = bestCombo;
  gameOverLayer.classList.add("visible");
}

function hideGameOverDialog() {
  if (!gameOverLayer) return;
  gameOverLayer.classList.remove("visible");
}

function showIntroDialog() {
  if (!introLayer) return;
  introLayer.classList.add("visible");
}

function hideIntroDialog() {
  if (!introLayer) return;
  introLayer.classList.remove("visible");
}

canvas.addEventListener("pointerdown", pointerDown);
canvas.addEventListener("pointermove", pointerMove);
canvas.addEventListener("pointerup", pointerUp);
canvas.addEventListener("pointercancel", pointerCancel);
window.addEventListener("resize", resizeCanvas);
resetButton.addEventListener("click", resetGame);
if (restartButton) {
  restartButton.addEventListener("click", () => {
    hideGameOverDialog();
    resetGame();
  });
}

if (startButton) {
  startButton.addEventListener("click", () => {
    hideIntroDialog();
    resetGame();
  });
}

// 모바일 핀치 줌 방지
window.addEventListener(
  "gesturestart",
  (event) => {
    event.preventDefault();
  },
  { passive: false }
);

let lastTouchEnd = 0;
window.addEventListener(
  "touchstart",
  (event) => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  },
  { passive: false }
);

window.addEventListener(
  "touchend",
  (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 350) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  },
  { passive: false }
);

resizeCanvas();
updateTimerDisplay();
updateComboTimerText();
requestAnimationFrame(loop);
showIntroDialog();
