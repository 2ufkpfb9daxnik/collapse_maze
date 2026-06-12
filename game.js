const ROWS = 15;
const COLS = 19;
const STORAGE_KEY = "collapsing-dungeon-record-v2";

const TILE = {
  WALL: "wall",
  FLOOR: "floor",
  BROKEN: "broken",
  EXIT: "exit"
};

const SOUND_FILES = {
  gameStart: "button03b.mp3",
  keyPickup: "powerup03.mp3",
  treasurePickup: "coin04.mp3",
  unlock: "correct_answer1.mp3",
  move: "knock_on_thick_glass4.mp3"
};

const soundEffects = Object.fromEntries(
  Object.entries(SOUND_FILES).map(([name, fileName]) => {
    const audio = new Audio(fileName);
    audio.preload = "auto";
    return [name, audio];
  })
);

const boardEl = document.getElementById("board");
const floorNumberEl = document.getElementById("floorNumber");
const stepsEl = document.getElementById("steps");
const treasuresEl = document.getElementById("treasures");
const hasKeyEl = document.getElementById("hasKey");
const stateTextEl = document.getElementById("stateText");
const scoreEl = document.getElementById("score");
const bestFloorEl = document.getElementById("bestFloor");
const bestScoreEl = document.getElementById("bestScore");
const messageEl = document.getElementById("message");
const restartButton = document.getElementById("restartButton");
const nextFloorButton = document.getElementById("nextFloorButton");
const maxLogEntries = 12;

let grid = [];
let player = { x: 1, y: 1 };
let start = { x: 1, y: 1 };
let exit = { x: 1, y: 1 };
let keyItem = null;
let treasures = [];
let initialTreasureCount = 0;

let floorNumber = 1;
let steps = 0;
let totalSteps = 0;
let hasKey = false;
let state = "playing";
let score = 0;
let record = { bestFloor: 1, bestScore: 0 };

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function playSound(name) {
  const sound = soundEffects[name];

  if (!sound) {
    return;
  }

  const clone = sound.cloneNode();
  clone.play().catch(() => {
    // 効果音は再生できない環境でもゲーム進行を止めない。
  });
}

function coordKey(pos) {
  return `${pos.x},${pos.y}`;
}

function inBounds(x, y) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS;
}

function isInsideBorder(x, y) {
  return x > 0 && x < COLS - 1 && y > 0 && y < ROWS - 1;
}

function createFilledGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(TILE.WALL));
}

function getNeighbors(pos) {
  return [
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x, y: pos.y - 1 }
  ].filter(next => inBounds(next.x, next.y));
}

function shuffle(array) {
  const copied = array.slice();

  for (let i = copied.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }

  return copied;
}

function getWalkablePositions() {
  const result = [];

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x] === TILE.FLOOR || grid[y][x] === TILE.EXIT) {
        result.push({ x, y });
      }
    }
  }

  return result;
}

function loadRecord() {
  const fallback = { bestFloor: 1, bestScore: 0 };

  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return fallback;
    }

    const parsed = JSON.parse(saved);

    return {
      bestFloor: Number(parsed.bestFloor) || 1,
      bestScore: Number(parsed.bestScore) || 0
    };
  } catch {
    return fallback;
  }
}

function saveRecord() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // localStorage が使えない環境では保存しない。
  }
}

function updateRecord() {
  let changed = false;

  if (floorNumber > record.bestFloor) {
    record.bestFloor = floorNumber;
    changed = true;
  }

  if (score > record.bestScore) {
    record.bestScore = score;
    changed = true;
  }

  if (changed) {
    saveRecord();
  }
}

function clearLogs() {
  if (messageEl) {
    messageEl.innerHTML = "";
  }
}

function appendLog(text) {
  if (!messageEl) {
    return;
  }

  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.textContent = text;
  messageEl.appendChild(entry);

  while (messageEl.children.length > maxLogEntries) {
    messageEl.removeChild(messageEl.firstElementChild);
  }

  messageEl.scrollTop = messageEl.scrollHeight;
}

function carveFloor(x, y) {
  if (isInsideBorder(x, y)) {
    grid[y][x] = TILE.FLOOR;
  }
}

function generateMainPath() {
  grid = createFilledGrid();
  const path = [];
  const visited = new Set();

  let current = {
    x: randomInt(2, COLS - 3),
    y: randomInt(2, ROWS - 3)
  };

  path.push({ ...current });
  visited.add(coordKey(current));
  carveFloor(current.x, current.y);

  const floorBonus = Math.min(16, floorNumber * 2);
  const targetLength = randomInt(26 + floorBonus, 40 + floorBonus);

  for (let i = 0; i < targetLength; i++) {
    const candidates = shuffle(getNeighbors(current))
      .filter(next => isInsideBorder(next.x, next.y))
      .filter(next => !visited.has(coordKey(next)));

    if (candidates.length === 0) {
      break;
    }

    current = candidates[0];
    path.push({ ...current });
    visited.add(coordKey(current));
    carveFloor(current.x, current.y);
  }

  return path;
}

function addRooms(path) {
  const roomCount = randomInt(4, Math.min(9, 5 + Math.floor(floorNumber / 2)));

  for (let i = 0; i < roomCount; i++) {
    const anchor = choice(path);
    const width = randomInt(2, 4);
    const height = randomInt(2, 4);
    const startX = anchor.x - randomInt(0, width - 1);
    const startY = anchor.y - randomInt(0, height - 1);

    for (let y = startY; y < startY + height; y++) {
      for (let x = startX; x < startX + width; x++) {
        carveFloor(x, y);
      }
    }
  }
}

function addBranches() {
  const branchCount = randomInt(7, Math.min(18, 10 + floorNumber));

  for (let i = 0; i < branchCount; i++) {
    const floors = getWalkablePositions();

    if (floors.length === 0) {
      return;
    }

    let current = choice(floors);
    const length = randomInt(2, Math.min(8, 4 + Math.floor(floorNumber / 2)));

    for (let j = 0; j < length; j++) {
      const candidates = shuffle(getNeighbors(current))
        .filter(next => isInsideBorder(next.x, next.y));

      if (candidates.length === 0) {
        break;
      }

      current = candidates[0];
      carveFloor(current.x, current.y);
    }
  }
}

function findFarthestFrom(origin) {
  const queue = [{ x: origin.x, y: origin.y, distance: 0 }];
  const visited = new Set([coordKey(origin)]);
  let farthest = { x: origin.x, y: origin.y, distance: 0 };

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.distance > farthest.distance) {
      farthest = current;
    }

    for (const next of getNeighbors(current)) {
      const key = coordKey(next);

      if (visited.has(key) || grid[next.y][next.x] === TILE.WALL) {
        continue;
      }

      visited.add(key);
      queue.push({
        x: next.x,
        y: next.y,
        distance: current.distance + 1
      });
    }
  }

  return { x: farthest.x, y: farthest.y };
}

function distanceManhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function placeItems(path) {
  start = { ...path[0] };
  player = { ...start };

  exit = { ...path[path.length - 1] };
  grid[exit.y][exit.x] = TILE.EXIT;

  const keyStartIndex = Math.max(1, Math.floor(path.length * 0.35));
  const keyEndIndex = Math.max(keyStartIndex, path.length - 2);
  const selectedKey = path[randomInt(keyStartIndex, keyEndIndex)];

  keyItem = { x: selectedKey.x, y: selectedKey.y };

  const allPositions = getWalkablePositions();
  const candidates = allPositions.filter(pos => coordKey(pos) !== coordKey(start) && coordKey(pos) !== coordKey(exit) && coordKey(pos) !== coordKey(keyItem));

  if (candidates.length === 0) {
    treasures = [];
    initialTreasureCount = 0;
    return;
  }

  const blocked = new Set([coordKey(start), coordKey(exit), coordKey(keyItem)]);
  const treasureCandidates = candidates.filter(pos => !blocked.has(coordKey(pos)));
  const treasureMax = Math.min(8, 3 + Math.floor(floorNumber / 2));
  const treasureTarget = Math.min(treasureCandidates.length, randomInt(3, Math.max(3, treasureMax)));

  treasures = [];

  for (let i = 0; i < treasureTarget; i++) {
    const index = randomInt(0, treasureCandidates.length - 1);
    const selected = treasureCandidates[index];
    treasures.push({ x: selected.x, y: selected.y });
    treasureCandidates.splice(index, 1);
  }

  initialTreasureCount = treasures.length;
}

function createFallbackDungeon() {
  grid = createFilledGrid();
  const path = [];

  for (let y = 4; y <= 10; y++) {
    for (let x = 5; x <= 13; x++) {
      carveFloor(x, y);
      path.push({ x, y });
    }
  }

  return path;
}

function generateDungeon() {
  let path = [];

  for (let attempt = 0; attempt < 60; attempt++) {
    path = generateMainPath();

    if (path.length < 24) {
      continue;
    }

    addRooms(path);
    addBranches();

    if (getWalkablePositions().length >= 28) {
      placeItems(path);
      return;
    }
  }

  path = createFallbackDungeon();
  placeItems(path);
}

function updateMessage(text) {
  appendLog(text);
}

function addScore(points) {
  score += points;
  if (score < 0) {
    score = 0;
  }
  updateRecord();
}

function canMoveTo(x, y) {
  if (!inBounds(x, y)) {
    return false;
  }

  const tile = grid[y][x];
  return tile !== TILE.WALL && tile !== TILE.BROKEN;
}

function hasAvailableMove() {
  return getNeighbors(player).some(next => canMoveTo(next.x, next.y));
}

function getTreasureAt(x, y) {
  return treasures.find(treasure => treasure.x === x && treasure.y === y);
}

function removeTreasureAt(x, y) {
  treasures = treasures.filter(treasure => !(treasure.x === x && treasure.y === y));
}

function finishFloor() {
  state = "cleared";

  const collectedTreasures = initialTreasureCount - treasures.length;
  const floorClearBonus = 500 + floorNumber * 100;
  const treasureBonus = collectedTreasures * 100;
  const keyBonus = hasKey ? 150 : 0;
  const stepPenalty = steps * 3;

  addScore(floorClearBonus + treasureBonus + keyBonus - stepPenalty);
  totalSteps += steps;
  updateRecord();
  updateMessage(`第${floorNumber}階層を突破！ 次の階層へ`);
  goToNextFloor();
}

function startFloor() {
  generateDungeon();
  steps = 0;
  hasKey = false;
  state = "playing";
  updateMessage(`第${floorNumber}階層です。鍵を取って出口を目指しましょう。`);
  render();
}

function startRun() {
  clearLogs();
  floorNumber = 1;
  steps = 0;
  totalSteps = 0;
  hasKey = false;
  state = "playing";
  score = 0;
  updateMessage("新しい挑戦を始めました。");
  playSound("gameStart");
  startFloor();
}

function goToNextFloor() {
  if (state !== "cleared") {
    return;
  }

  floorNumber += 1;
  updateRecord();
  startFloor();
}

function tryMove(dx, dy) {
  if (state === "cleared") {
    updateMessage("この階層は突破済みです。Enter またはボタンで次の階層へ進めます。");
    return;
  }

  if (state !== "playing") {
    return;
  }

  const nextX = player.x + dx;
  const nextY = player.y + dy;

  if (!canMoveTo(nextX, nextY)) {
    updateMessage("そこには進めません。壁か崩れ床です。");
    return;
  }

  if (grid[player.y][player.x] === TILE.FLOOR) {
    grid[player.y][player.x] = TILE.BROKEN;
  }

  player = { x: nextX, y: nextY };
  steps += 1;
  addScore(-1);
  playSound("move");

  if (keyItem && player.x === keyItem.x && player.y === keyItem.y) {
    const beforeKeyScore = score;
    hasKey = true;
    keyItem = null;
    addScore(50);
    updateMessage(`鍵を拾いました。スコア +${score - beforeKeyScore} (${beforeKeyScore} → ${score})`);
    playSound("keyPickup");
  }

  const treasure = getTreasureAt(player.x, player.y);

  if (treasure) {
    const beforeTreasureScore = score;
    removeTreasureAt(player.x, player.y);
    addScore(100);
    updateMessage(`宝を手に入れました。スコア +${score - beforeTreasureScore} (${beforeTreasureScore} → ${score})`);
    playSound("treasurePickup");
  }

  if (player.x === exit.x && player.y === exit.y) {
    if (hasKey) {
      playSound("unlock");
      finishFloor();
      return;
    }

    updateMessage("出口は閉じています。鍵が必要です。");
  }

  if (state === "playing" && !hasAvailableMove()) {
    state = "lost";
    updateRecord();
    updateMessage("行き止まりです。R またはボタンで新しい挑戦を始められます。");
  }

  render();
}

function createEntity(className, text) {
  const entity = document.createElement("div");
  entity.className = `entity ${className}`;
  entity.textContent = text;
  return entity;
}

function render() {
  if (!boardEl) {
    return;
  }

  boardEl.style.setProperty("--cols", COLS);
  boardEl.style.setProperty("--rows", ROWS);
  boardEl.innerHTML = "";

  const treasureSet = new Set(treasures.map(coordKey));

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tileEl = document.createElement("div");
      const tile = grid[y][x];
      tileEl.className = `tile ${tile}`;

      if (tile === TILE.EXIT) {
        tileEl.classList.add(hasKey ? "open" : "locked");
      }

      if (keyItem && keyItem.x === x && keyItem.y === y) {
        tileEl.appendChild(createEntity("key", "🔑"));
      }

      if (treasureSet.has(`${x},${y}`)) {
        tileEl.appendChild(createEntity("treasure", "💰"));
      }

      if (player.x === x && player.y === y) {
        tileEl.appendChild(createEntity("player", "🧭"));
      }

      boardEl.appendChild(tileEl);
    }
  }

  const collectedTreasures = initialTreasureCount - treasures.length;
  floorNumberEl.textContent = String(floorNumber);
  stepsEl.textContent = `${steps} / 累計 ${totalSteps + steps}`;
  treasuresEl.textContent = `${collectedTreasures} / ${initialTreasureCount}`;
  hasKeyEl.textContent = hasKey ? "あり" : "なし";
  scoreEl.textContent = String(score);
  bestFloorEl.textContent = String(record.bestFloor);
  bestScoreEl.textContent = String(record.bestScore);
  stateTextEl.textContent = state === "playing" ? "探索中" : state === "cleared" ? "突破" : "失敗";

  if (nextFloorButton) {
    nextFloorButton.disabled = state !== "cleared";
  }
}

document.addEventListener("keydown", event => {
  const key = event.key;

  if (key === "r" || key === "R") {
    startRun();
    return;
  }

  if (key === "Enter") {
    goToNextFloor();
    return;
  }

  if (key === "ArrowUp" || key === "w" || key === "W") {
    event.preventDefault();
    tryMove(0, -1);
  } else if (key === "ArrowDown" || key === "s" || key === "S") {
    event.preventDefault();
    tryMove(0, 1);
  } else if (key === "ArrowLeft" || key === "a" || key === "A") {
    event.preventDefault();
    tryMove(-1, 0);
  } else if (key === "ArrowRight" || key === "d" || key === "D") {
    event.preventDefault();
    tryMove(1, 0);
  }
});

if (restartButton) {
  restartButton.addEventListener("click", startRun);
}

if (nextFloorButton) {
  nextFloorButton.addEventListener("click", goToNextFloor);
}

record = loadRecord();
startRun();