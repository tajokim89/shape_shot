const SHAPES = ["square", "circle", "triangle"];
const COLORS = [
  { name: "R", value: "#ff5f5f", label: "RED" },
  { name: "G", value: "#3dd598", label: "GREEN" },
  { name: "B", value: "#4a7fff", label: "BLUE" },
];
const THROW_SPEED_THRESHOLD = 0.65; // px per ms
const THROW_UPWARD_LIMIT = -0.2; // velocity.y must be negative enough
const THROW_MAX_DURATION = 1400; // ms
const GRAVITY = 0.0035; // px per ms^2

const targetContainer = document.getElementById("target-container");
const spawnZone = document.getElementById("spawn-zone");
const scoreValue = document.getElementById("score-value");
const resetButton = document.getElementById("reset-button");

let targets = [];
let score = 0;
let activeShape = null;

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createShapePiece({ shape, color, compact = false, draggable = false }) {
  const wrapper = document.createElement("div");
  wrapper.className = "shape-piece";
  if (compact) wrapper.classList.add("compact");
  if (draggable) wrapper.classList.add("draggable");
  wrapper.dataset.shape = shape;
  wrapper.dataset.color = color.name;
  wrapper.style.color = color.value;

  const icon = document.createElement("div");
  icon.className = `shape-icon ${shape}`;
  wrapper.appendChild(icon);

  const label = document.createElement("span");
  label.className = "shape-label";
  label.textContent = `${color.label} ${shape.toUpperCase()}`;
  wrapper.appendChild(label);

  if (draggable) {
    enableDrag(wrapper);
  }
  return wrapper;
}

function generateTargets() {
  targets = Array.from({ length: 3 }, () => ({
    shape: randomItem(SHAPES),
    color: randomItem(COLORS),
  }));
  renderTargets();
}

function renderTargets() {
  targetContainer.innerHTML = "";
  targets.forEach((target, index) => {
    const slot = document.createElement("div");
    slot.className = "target-slot";
    slot.dataset.index = index;
    const piece = createShapePiece({
      shape: target.shape,
      color: target.color,
      compact: true,
    });
    slot.appendChild(piece);
    targetContainer.appendChild(slot);
  });
}

function spawnShape() {
  spawnZone.innerHTML = "";
  activeShape = {
    shape: randomItem(SHAPES),
    color: randomItem(COLORS),
  };
  const piece = createShapePiece({
    shape: activeShape.shape,
    color: activeShape.color,
    draggable: true,
  });
  piece.id = "active-piece";
  spawnZone.appendChild(piece);
}

function updateScore(delta) {
  score = Math.max(0, score + delta);
  scoreValue.textContent = score;
}

function resetGame() {
  score = 0;
  updateScore(0);
  generateTargets();
  spawnShape();
}

function enableDrag(piece) {
  let pointerId = null;
  let offsetX = 0;
  let offsetY = 0;
  let startParent = null;
  let pointerHistory = [];

  const onPointerDown = (event) => {
    pointerId = event.pointerId;
    piece.setPointerCapture(pointerId);

    const rect = piece.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    startParent = piece.parentElement;
    pointerHistory = [
      { x: event.clientX, y: event.clientY, time: performance.now() },
    ];

    piece.classList.add("dragging");
    piece.style.position = "fixed";
    piece.style.left = `${rect.left}px`;
    piece.style.top = `${rect.top}px`;
    document.body.appendChild(piece);
    piece.addEventListener("pointermove", onPointerMove);
    piece.addEventListener("pointerup", onPointerUp);
    piece.addEventListener("pointercancel", onPointerUp);
  };

  const onPointerMove = (event) => {
    if (event.pointerId !== pointerId) return;
    const now = performance.now();
    piece.style.left = `${event.clientX - offsetX}px`;
    piece.style.top = `${event.clientY - offsetY}px`;
    pointerHistory.push({ x: event.clientX, y: event.clientY, time: now });
    if (pointerHistory.length > 6) pointerHistory.shift();
  };

  const onPointerUp = (event) => {
    if (event.pointerId !== pointerId) return;
    piece.releasePointerCapture(pointerId);
    piece.removeEventListener("pointermove", onPointerMove);
    piece.removeEventListener("pointerup", onPointerUp);
    piece.removeEventListener("pointercancel", onPointerUp);
    pointerId = null;
    const velocity = computeVelocity(pointerHistory);
    if (shouldThrow(velocity)) {
      startThrowMotion(piece, startParent, velocity);
    } else {
      handleDrop(event.clientX, event.clientY, piece, startParent);
    }
  };

  piece.addEventListener("pointerdown", onPointerDown);
}

function computeVelocity(history) {
  if (history.length < 2) return null;
  const first = history[0];
  const last = history[history.length - 1];
  const deltaTime = last.time - first.time;
  if (!deltaTime) return null;
  return {
    x: (last.x - first.x) / deltaTime,
    y: (last.y - first.y) / deltaTime,
  };
}

function shouldThrow(velocity) {
  if (!velocity) return false;
  const speed = Math.hypot(velocity.x, velocity.y);
  return speed > THROW_SPEED_THRESHOLD && velocity.y < THROW_UPWARD_LIMIT;
}

function handleDrop(x, y, piece, fallbackParent) {
  const dropTarget = findSlotAtPoint(x, y);
  if (!dropTarget) {
    resetPiecePosition(piece, fallbackParent);
    return;
  }
  resolveSlotHit(dropTarget.slot, dropTarget.target, piece, fallbackParent);
}

function findSlotAtPoint(x, y) {
  for (let index = 0; index < targets.length; index += 1) {
    const slot = targetContainer.querySelector(`[data-index="${index}"]`);
    if (!slot) continue;
    const rect = slot.getBoundingClientRect();
    const within =
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    if (within) {
      return { slot, target: targets[index] };
    }
  }
  return null;
}

function resolveSlotHit(slot, target, piece, fallbackParent) {
  const isMatch = target.shape === piece.dataset.shape;

  if (isMatch) {
    slot.classList.add("match");
    updateScore(1);
    piece.remove();
    setTimeout(() => slot.classList.remove("match"), 280);
    spawnShape();
  } else {
    slot.classList.add("shake");
    setTimeout(() => slot.classList.remove("shake"), 400);
    updateScore(-1);
    resetPiecePosition(piece, fallbackParent);
  }
}

function startThrowMotion(piece, fallbackParent, velocity) {
  const startTime = performance.now();
  let lastTime = startTime;

  const step = (time) => {
    const delta = time - lastTime;
    lastTime = time;
    const currentLeft = parseFloat(piece.style.left);
    const currentTop = parseFloat(piece.style.top);
    const nextLeft = currentLeft + velocity.x * delta;
    const nextTop = currentTop + velocity.y * delta;
    velocity.y += GRAVITY * delta;

    piece.style.left = `${nextLeft}px`;
    piece.style.top = `${nextTop}px`;

    const rect = piece.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const hit = findSlotAtPoint(centerX, centerY);
    if (hit) {
      resolveSlotHit(hit.slot, hit.target, piece, fallbackParent);
      return;
    }

    const outOfBounds =
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth ||
      time - startTime > THROW_MAX_DURATION;

    if (outOfBounds) {
      resetPiecePosition(piece, fallbackParent);
      return;
    }

    requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

function resetPiecePosition(piece, parent) {
  piece.classList.remove("dragging");
  piece.style.position = "";
  piece.style.left = "";
  piece.style.top = "";
  parent.appendChild(piece);
}

resetButton.addEventListener("click", resetGame);
resetGame();
