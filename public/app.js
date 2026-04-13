const GRID_SIZE = { rows: 12, cols: 12 };

const ALGORITHMS = {
  bfs: {
    label: "BFS",
    title: "Breadth-First Search",
    heuristic: "Not used",
    note: "BFS explores the grid one layer at a time, so it guarantees the shortest path on this unweighted maze.",
    pseudocode: `queue <- [start]
visited <- {start}
parent[start] <- null

while queue is not empty
  node <- pop front of queue
  if node == goal
    return reconstruct path

  for neighbor in Right, Down, Left, Up
    if neighbor is valid and unseen
      visited add neighbor
      parent[neighbor] <- node
      push neighbor to back of queue

return no path`
  },
  dfs: {
    label: "DFS",
    title: "Depth-First Search",
    heuristic: "Not used",
    note: "DFS chases the newest branch first, which makes the animation dramatic but does not guarantee the shortest path.",
    pseudocode: `stack <- [start]
visited <- {start}
parent[start] <- null

while stack is not empty
  node <- pop top of stack
  if node == goal
    return reconstruct path

  for neighbor in Right, Down, Left, Up
    if neighbor is valid and unseen
      visited add neighbor
      parent[neighbor] <- node
      push neighbor onto stack in reverse order

return no path`
  },
  astar: {
    label: "A*",
    title: "A* Search",
    heuristic: "Manhattan distance",
    note: "A* combines the real distance so far with a Manhattan-distance estimate to stay focused on the goal.",
    pseudocode: `openSet <- {start}
g[start] <- 0
f[start] <- h(start, goal)
parent[start] <- null

while openSet is not empty
  node <- entry with lowest f, then lowest h
  if node == goal
    return reconstruct path

  for neighbor in Right, Down, Left, Up
    if neighbor is valid
      tentativeG <- g[node] + 1
      if tentativeG improves neighbor
        parent[neighbor] <- node
        g[neighbor] <- tentativeG
        f[neighbor] <- tentativeG + h(neighbor, goal)
        add or update neighbor in openSet

return no path`
  }
};

const TOOLS = {
  wall: {
    title: "Draw Walls",
    hint: "Click and drag across the grid to paint obstacles while keeping the start and goal open."
  },
  erase: {
    title: "Erase",
    hint: "Drag across cells to remove walls and reopen new corridors for the search."
  },
  start: {
    title: "Place Start",
    hint: "Select a cell to move the start position. Start and goal stay separate so the board remains valid."
  },
  goal: {
    title: "Place Goal",
    hint: "Select a destination cell and compare how BFS, DFS, and A* respond to the same maze."
  }
};

const state = {
  algorithm: "bfs",
  tool: "wall",
  board: createDefaultBoard(),
  challenge: null,
  history: [],
  result: null,
  currentStepIndex: -1,
  isPlaying: false,
  playTimer: null,
  toastTimer: null,
  isPointerDown: false,
  dragMode: null,
  lastPaintKey: null,
  cellRefs: new Map()
};

const elements = {
  heroChallengeBtn: document.querySelector("#heroChallengeBtn"),
  labelInput: document.querySelector("#labelInput"),
  runSearchBtn: document.querySelector("#runSearchBtn"),
  clearBoardBtn: document.querySelector("#clearBoardBtn"),
  randomMazeBtn: document.querySelector("#randomMazeBtn"),
  loadChallengeBtn: document.querySelector("#loadChallengeBtn"),
  applyChallengeBtn: document.querySelector("#applyChallengeBtn"),
  prevStepBtn: document.querySelector("#prevStepBtn"),
  nextStepBtn: document.querySelector("#nextStepBtn"),
  playPauseBtn: document.querySelector("#playPauseBtn"),
  statusBadge: document.querySelector("#statusBadge"),
  progressFill: document.querySelector("#progressFill"),
  progressText: document.querySelector("#progressText"),
  gridBoard: document.querySelector("#gridBoard"),
  algorithmValue: document.querySelector("#algorithmValue"),
  visitedValue: document.querySelector("#visitedValue"),
  pathValue: document.querySelector("#pathValue"),
  stepValue: document.querySelector("#stepValue"),
  heuristicValue: document.querySelector("#heuristicValue"),
  messageTitle: document.querySelector("#messageTitle"),
  messageBody: document.querySelector("#messageBody"),
  messageInsight: document.querySelector("#messageInsight"),
  toolTitle: document.querySelector("#toolTitle"),
  toolHint: document.querySelector("#toolHint"),
  boardStats: document.querySelector("#boardStats"),
  challengeTitle: document.querySelector("#challengeTitle"),
  challengeMode: document.querySelector("#challengeMode"),
  challengePrompt: document.querySelector("#challengePrompt"),
  challengeHint: document.querySelector("#challengeHint"),
  challengeMeta: document.querySelector("#challengeMeta"),
  historyList: document.querySelector("#historyList"),
  pseudocodeTitle: document.querySelector("#pseudocodeTitle"),
  pseudocodeCode: document.querySelector("#pseudocodeCode"),
  pseudocodeNote: document.querySelector("#pseudocodeNote"),
  toast: document.querySelector("#toast"),
  algorithmButtons: Array.from(document.querySelectorAll("[data-algorithm]")),
  toolButtons: Array.from(document.querySelectorAll("[data-tool]"))
};

function createDefaultBoard() {
  return {
    gridSize: { rows: GRID_SIZE.rows, cols: GRID_SIZE.cols },
    start: { row: 1, col: 1 },
    goal: { row: 10, col: 10 },
    walls: new Set()
  };
}

function cellKey(cell) {
  return `${cell.row}:${cell.col}`;
}

function keyToCell(key) {
  const [row, col] = String(key)
    .split(":")
    .map((value) => Number(value));

  return { row, col };
}

function cloneCell(cell) {
  return { row: cell.row, col: cell.col };
}

function sameCell(first, second) {
  return first.row === second.row && first.col === second.col;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sortWallKeys(wallSet) {
  return Array.from(wallSet).sort((first, second) => {
    const firstCell = keyToCell(first);
    const secondCell = keyToCell(second);

    if (firstCell.row !== secondCell.row) {
      return firstCell.row - secondCell.row;
    }

    return firstCell.col - secondCell.col;
  });
}

function boardFromSnapshot(snapshot) {
  return {
    gridSize: { rows: snapshot.gridSize.rows, cols: snapshot.gridSize.cols },
    start: cloneCell(snapshot.start),
    goal: cloneCell(snapshot.goal),
    walls: new Set((snapshot.walls || []).map((cell) => cellKey(cell)))
  };
}

function serializeBoard() {
  return {
    algorithm: state.algorithm,
    gridSize: { rows: state.board.gridSize.rows, cols: state.board.gridSize.cols },
    start: cloneCell(state.board.start),
    goal: cloneCell(state.board.goal),
    walls: sortWallKeys(state.board.walls).map((key) => keyToCell(key)),
    label: elements.labelInput.value.trim() || `${ALGORITHMS[state.algorithm].label} Studio Run`
  };
}

function traversableCellCount() {
  return state.board.gridSize.rows * state.board.gridSize.cols - state.board.walls.size;
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");

  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2600);
}

function stopPlayback() {
  if (state.playTimer) {
    window.clearInterval(state.playTimer);
    state.playTimer = null;
  }

  state.isPlaying = false;
  elements.playPauseBtn.textContent = "Auto Play";
}

function clearCurrentRun(shouldRender = true) {
  stopPlayback();
  state.result = null;
  state.currentStepIndex = -1;

  if (shouldRender) {
    renderBoard();
    renderRuntime();
  }
}

function buildGridBoard() {
  const fragment = document.createDocumentFragment();

  for (let row = 0; row < GRID_SIZE.rows; row += 1) {
    for (let col = 0; col < GRID_SIZE.cols; col += 1) {
      const cell = document.createElement("button");
      const key = cellKey({ row, col });

      cell.type = "button";
      cell.className = "grid-cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.innerHTML = '<span class="cell-token"></span><span class="cell-coord"></span>';
      cell.setAttribute("aria-label", `Grid cell ${row + 1}, ${col + 1}`);

      state.cellRefs.set(key, cell);
      fragment.appendChild(cell);
    }
  }

  elements.gridBoard.innerHTML = "";
  elements.gridBoard.appendChild(fragment);
}

function getVisibleStep() {
  if (!state.result || state.currentStepIndex < 0) {
    return null;
  }

  return state.result.steps[state.currentStepIndex] || null;
}

function getTraceOverlay() {
  const overlay = {
    visited: new Set(),
    frontier: new Set(),
    path: new Set(),
    fresh: new Set(),
    activeKey: null
  };

  if (!state.result || state.currentStepIndex < 0) {
    return overlay;
  }

  for (let index = 0; index <= state.currentStepIndex; index += 1) {
    const step = state.result.steps[index];

    if (!step) {
      continue;
    }

    if (step.kind === "start" || step.kind === "expand") {
      const nextFrontier = new Set((step.frontier || []).map((cell) => cellKey(cell)));

      if (index === state.currentStepIndex) {
        overlay.fresh = new Set(
          Array.from(nextFrontier).filter((key) => !overlay.frontier.has(key))
        );
      }

      overlay.frontier = nextFrontier;
      overlay.activeKey = step.current ? cellKey(step.current) : null;
    }

    if (step.kind === "expand" && step.current) {
      overlay.visited.add(cellKey(step.current));
    }

    if (step.kind === "path") {
      overlay.path = new Set((step.path || []).map((cell) => cellKey(cell)));
      overlay.frontier = new Set();
      overlay.fresh = new Set();
      overlay.activeKey = step.current ? cellKey(step.current) : null;
    }

    if (step.kind === "result") {
      overlay.path = new Set((step.path || []).map((cell) => cellKey(cell)));
      overlay.frontier = new Set();
      overlay.fresh = new Set();
      overlay.activeKey = step.current ? cellKey(step.current) : null;
    }
  }

  return overlay;
}

function renderBoard() {
  const overlay = getTraceOverlay();
  const startKey = cellKey(state.board.start);
  const goalKey = cellKey(state.board.goal);

  state.cellRefs.forEach((element, key) => {
    const classes = ["grid-cell"];
    let token = "";

    if (state.board.walls.has(key)) {
      classes.push("is-wall");
    } else {
      if (overlay.visited.has(key)) {
        classes.push("is-visited");
      }

      if (overlay.frontier.has(key)) {
        classes.push("is-frontier");
      }

      if (overlay.path.has(key)) {
        classes.push("is-path");
      }

      if (overlay.fresh.has(key)) {
        classes.push("is-fresh");
      }
    }

    if (key === startKey) {
      classes.push("is-start");
      token = "S";
    } else if (key === goalKey) {
      classes.push("is-goal");
      token = "G";
    } else if (!state.board.walls.has(key) && overlay.activeKey === key) {
      token = "?";
    } else if (!state.board.walls.has(key) && overlay.path.has(key)) {
      token = "•";
    }

    if (overlay.activeKey === key) {
      classes.push("is-active");
    }

    const cell = keyToCell(key);
    element.className = classes.join(" ");
    element.querySelector(".cell-token").textContent = token;
    element.querySelector(".cell-coord").textContent = `${cell.row},${cell.col}`;
  });
}

function renderTooling() {
  const tool = TOOLS[state.tool];

  elements.toolTitle.textContent = tool.title;
  elements.toolHint.textContent = tool.hint;

  const boardStatParts = [
    `${state.board.gridSize.rows} x ${state.board.gridSize.cols} grid`,
    `${state.board.walls.size} walls`,
    `Start ${state.board.start.row},${state.board.start.col}`,
    `Goal ${state.board.goal.row},${state.board.goal.col}`
  ];

  elements.boardStats.textContent = boardStatParts.join(" | ");

  elements.algorithmButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.algorithm === state.algorithm);
  });

  elements.toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === state.tool);
  });
}

function renderChallenge() {
  if (!state.challenge) {
    return;
  }

  elements.challengeTitle.textContent = state.challenge.title;
  elements.challengeMode.textContent = state.challenge.mode;
  elements.challengeMode.className = `chip ${challengeChipClass(state.challenge.palette)}`;
  elements.challengePrompt.textContent = state.challenge.prompt;
  elements.challengeHint.textContent = state.challenge.hint;
  elements.challengeMeta.textContent = `${state.challenge.wallCount} walls | ${state.challenge.gridSize.rows} x ${state.challenge.gridSize.cols} maze`;
}

function challengeChipClass(palette) {
  if (palette === "lagoon") {
    return "chip-lagoon";
  }

  if (palette === "comet") {
    return "chip-comet";
  }

  return "chip-sunrise";
}

function renderHistory() {
  if (!state.history.length) {
    elements.historyList.innerHTML = `
      <div class="empty-history">
        No runs yet. Launch BFS, DFS, or A* and the backend will log each studio run here.
      </div>
    `;
    return;
  }

  elements.historyList.innerHTML = state.history
    .map(
      (entry) => `
        <article class="history-item">
          <header>
            <strong>${escapeHtml(entry.label)}</strong>
            <span class="history-pill ${entry.found ? "found" : "missed"}">
              ${entry.found ? "Found" : "Missed"}
            </span>
          </header>
          <div class="history-meta">
            <span>${escapeHtml(ALGORITHMS[entry.algorithm]?.label || entry.algorithm.toUpperCase())}</span>
            <span>${entry.visitedCount} visited</span>
          </div>
          <div class="history-meta">
            <span>${entry.found ? `${entry.pathLength} step path` : "No route"}</span>
            <span>${escapeHtml(entry.displayTime)}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderPseudocode() {
  const algorithm = ALGORITHMS[state.algorithm];

  elements.pseudocodeTitle.textContent = `${algorithm.title} Pseudocode`;
  elements.pseudocodeCode.textContent = algorithm.pseudocode;
  elements.pseudocodeNote.textContent = algorithm.note;
}

function renderRuntime() {
  const step = getVisibleStep();
  const algorithm = ALGORITHMS[state.algorithm];
  const totalSteps = state.result?.steps.length || 0;
  const currentStepNumber = step ? state.currentStepIndex + 1 : 0;
  const visitedCount = step?.visitedCount || 0;
  const pathLength = step ? step.pathLength : null;
  const openCells = traversableCellCount();
  const progress = totalSteps ? (currentStepNumber / totalSteps) * 100 : 0;

  elements.progressFill.style.width = `${progress}%`;
  elements.progressText.textContent = totalSteps
    ? `Step ${currentStepNumber} of ${totalSteps} | ${visitedCount} visited out of ${openCells} open cells`
    : `Board ready with ${openCells} open cells. Click Run Search to launch ${algorithm.label}.`;

  elements.algorithmValue.textContent = algorithm.label;
  elements.visitedValue.textContent = String(visitedCount);
  elements.pathValue.textContent = pathLength === null ? "--" : String(pathLength);
  elements.stepValue.textContent = `${currentStepNumber} / ${totalSteps}`;
  elements.heuristicValue.textContent = algorithm.heuristic;

  if (!step) {
    elements.statusBadge.textContent = "Ready for a run";
    elements.statusBadge.className = "status-badge idle";
    elements.messageTitle.textContent = "Narration";
    elements.messageBody.textContent = `The board is ready. Launch ${algorithm.label} or edit the maze first.`;
    elements.messageInsight.textContent = algorithm.note;
  } else {
    elements.messageBody.textContent = step.message;
    elements.messageInsight.textContent = step.insight;

    if (step.kind === "result") {
      elements.statusBadge.textContent = step.found ? "Goal Reached" : "No Route";
      elements.statusBadge.className = `status-badge ${step.found ? "found" : "missed"}`;
      elements.messageTitle.textContent = "Mission Complete";
    } else {
      elements.statusBadge.textContent = `${algorithm.label} Running`;
      elements.statusBadge.className = "status-badge running";
      elements.messageTitle.textContent =
        step.kind === "start"
          ? "Search Armed"
          : step.kind === "path"
            ? "Route Reveal"
            : `${algorithm.label} Expansion`;
    }
  }

  elements.prevStepBtn.disabled = state.currentStepIndex <= 0;
  elements.nextStepBtn.disabled = !state.result || state.currentStepIndex >= totalSteps - 1;
  elements.playPauseBtn.disabled = !state.result;
  elements.playPauseBtn.textContent = state.isPlaying ? "Pause" : "Auto Play";
}

function renderAll() {
  renderTooling();
  renderChallenge();
  renderHistory();
  renderPseudocode();
  renderBoard();
  renderRuntime();
}

function setBoardFromChallenge(challenge, announce = true) {
  state.board = boardFromSnapshot(challenge);
  elements.labelInput.value = challenge.title;
  clearCurrentRun(false);
  renderBoard();
  renderRuntime();
  renderTooling();

  if (announce) {
    showToast("Challenge loaded into the grid.");
  }
}

function applyToolAtCell(cell, tool = state.tool) {
  const key = cellKey(cell);
  let changed = false;

  if (tool === "wall") {
    if (!sameCell(cell, state.board.start) && !sameCell(cell, state.board.goal) && !state.board.walls.has(key)) {
      state.board.walls.add(key);
      changed = true;
    }
  }

  if (tool === "erase") {
    if (state.board.walls.delete(key)) {
      changed = true;
    }
  }

  if (tool === "start") {
    if (sameCell(cell, state.board.goal)) {
      showToast("Start and goal must stay separate.");
      return;
    }

    if (!sameCell(cell, state.board.start)) {
      state.board.walls.delete(key);
      state.board.start = cloneCell(cell);
      changed = true;
    }
  }

  if (tool === "goal") {
    if (sameCell(cell, state.board.start)) {
      showToast("Start and goal must stay separate.");
      return;
    }

    if (!sameCell(cell, state.board.goal)) {
      state.board.walls.delete(key);
      state.board.goal = cloneCell(cell);
      changed = true;
    }
  }

  if (!changed) {
    return;
  }

  clearCurrentRun(false);
  renderBoard();
  renderRuntime();
  renderTooling();
}

function getCellFromEventTarget(target) {
  const button = target.closest(".grid-cell");

  if (!button) {
    return null;
  }

  return {
    row: Number(button.dataset.row),
    col: Number(button.dataset.col)
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  let data;

  try {
    data = await response.json();
  } catch (error) {
    throw new Error("The server returned an unexpected response.");
  }

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

async function refreshHistory() {
  try {
    const data = await fetchJson("/api/history");
    state.history = data.history || [];
    renderHistory();
  } catch (error) {
    showToast(error.message);
  }
}

async function previewChallenge(showMessage = true) {
  try {
    state.challenge = await fetchJson("/api/challenge");
    renderChallenge();

    if (showMessage) {
      showToast("Fresh challenge docked in the lab.");
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function randomizeBoard() {
  try {
    state.challenge = await fetchJson("/api/challenge");
    renderChallenge();
    setBoardFromChallenge(state.challenge, false);
    showToast("Random maze loaded.");
  } catch (error) {
    showToast(error.message);
  }
}

function applyCurrentChallenge() {
  if (!state.challenge) {
    showToast("Preview a challenge first.");
    return;
  }

  setBoardFromChallenge(state.challenge, true);
}

function clearBoard() {
  state.board.walls.clear();
  clearCurrentRun(false);
  renderBoard();
  renderRuntime();
  renderTooling();
  showToast("All walls cleared.");
}

async function runSearch() {
  if (sameCell(state.board.start, state.board.goal)) {
    showToast("Start and goal must stay separate.");
    return;
  }

  stopPlayback();

  try {
    const result = await fetchJson("/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(serializeBoard())
    });

    state.result = result;
    state.currentStepIndex = 0;
    state.board = boardFromSnapshot(result.board);
    renderBoard();
    renderRuntime();
    renderTooling();
    await refreshHistory();
    showToast(`${ALGORITHMS[state.algorithm].label} run complete. Use Auto Play or step through manually.`);
  } catch (error) {
    showToast(error.message);
  }
}

function goToStep(offset) {
  if (!state.result) {
    return;
  }

  stopPlayback();
  const totalSteps = state.result.steps.length;
  state.currentStepIndex = Math.min(Math.max(state.currentStepIndex + offset, 0), totalSteps - 1);
  renderBoard();
  renderRuntime();
}

function autoPlay() {
  if (!state.result) {
    return;
  }

  if (state.isPlaying) {
    stopPlayback();
    renderRuntime();
    return;
  }

  if (state.currentStepIndex >= state.result.steps.length - 1) {
    state.currentStepIndex = 0;
  }

  state.isPlaying = true;
  renderRuntime();

  state.playTimer = window.setInterval(() => {
    if (!state.result) {
      stopPlayback();
      renderRuntime();
      return;
    }

    if (state.currentStepIndex >= state.result.steps.length - 1) {
      stopPlayback();
      renderRuntime();
      return;
    }

    state.currentStepIndex += 1;
    renderBoard();
    renderRuntime();
  }, 720);
}

function handleGridPointerDown(event) {
  const cell = getCellFromEventTarget(event.target);

  if (!cell) {
    return;
  }

  event.preventDefault();
  state.isPointerDown = true;
  state.dragMode = state.tool === "wall" || state.tool === "erase" ? state.tool : null;
  state.lastPaintKey = cellKey(cell);
  applyToolAtCell(cell);
}

function handleGridPointerOver(event) {
  if (!state.isPointerDown || !state.dragMode) {
    return;
  }

  const cell = getCellFromEventTarget(event.target);

  if (!cell) {
    return;
  }

  const key = cellKey(cell);

  if (key === state.lastPaintKey) {
    return;
  }

  state.lastPaintKey = key;
  applyToolAtCell(cell, state.dragMode);
}

function resetPointerPainting() {
  state.isPointerDown = false;
  state.dragMode = null;
  state.lastPaintKey = null;
}

function attachEventListeners() {
  elements.algorithmButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.algorithm === state.algorithm) {
        return;
      }

      state.algorithm = button.dataset.algorithm;
      clearCurrentRun(false);
      renderAll();
    });
  });

  elements.toolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.tool = button.dataset.tool;
      renderTooling();
    });
  });

  elements.runSearchBtn.addEventListener("click", runSearch);
  elements.clearBoardBtn.addEventListener("click", clearBoard);
  elements.randomMazeBtn.addEventListener("click", randomizeBoard);
  elements.loadChallengeBtn.addEventListener("click", () => previewChallenge(true));
  elements.applyChallengeBtn.addEventListener("click", applyCurrentChallenge);
  elements.heroChallengeBtn.addEventListener("click", () => previewChallenge(true));
  elements.prevStepBtn.addEventListener("click", () => goToStep(-1));
  elements.nextStepBtn.addEventListener("click", () => goToStep(1));
  elements.playPauseBtn.addEventListener("click", autoPlay);

  elements.gridBoard.addEventListener("pointerdown", handleGridPointerDown);
  elements.gridBoard.addEventListener("pointerover", handleGridPointerOver);
  elements.gridBoard.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener("pointerup", resetPointerPainting);
  window.addEventListener("pointercancel", resetPointerPainting);
}

async function init() {
  buildGridBoard();
  attachEventListeners();
  renderAll();

  await Promise.all([previewChallenge(false), refreshHistory()]);

  if (state.challenge) {
    setBoardFromChallenge(state.challenge, false);
  }

  renderAll();
}

init();
