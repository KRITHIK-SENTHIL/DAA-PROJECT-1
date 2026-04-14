const GRID_ROWS = 12;
const GRID_COLS = 12;
const PLAYBACK_DELAY_MS = 900;

const ALGORITHM_META = {
  bfs: {
    label: "BFS",
    heuristic: "Not used",
    title: "Breadth-First Search Pseudocode",
    pseudocode: `queue <- [start]
mark start as discovered

while queue is not empty:
  current <- dequeue queue
  if current == goal:
    reconstruct path using parents

  for neighbor in [right, down, left, up]:
    if neighbor is valid and undiscovered:
      parent[neighbor] <- current
      mark neighbor as discovered
      enqueue neighbor`,
    note: "BFS explores one complete frontier layer at a time, so the first route it finds is the shortest on this unweighted grid."
  },
  dfs: {
    label: "DFS",
    heuristic: "Not used",
    title: "Depth-First Search Pseudocode",
    pseudocode: `stack <- [start]
mark start as discovered

while stack is not empty:
  current <- pop stack
  if current == goal:
    reconstruct path using parents

  for neighbor in reverse([right, down, left, up]):
    if neighbor is valid and undiscovered:
      parent[neighbor] <- current
      mark neighbor as discovered
      push neighbor`,
    note: "DFS keeps diving along the newest branch first, which makes it great for demonstrating exploration order but not shortest paths."
  },
  astar: {
    label: "A*",
    heuristic: "Manhattan distance",
    title: "A* Search Pseudocode",
    pseudocode: `open <- priority queue seeded with start
gScore[start] <- 0

while open is not empty:
  current <- node with lowest f = g + h
  if current == goal:
    reconstruct path using parents

  for neighbor in [right, down, left, up]:
    tentativeG <- gScore[current] + 1
    if tentativeG improves neighbor:
      parent[neighbor] <- current
      gScore[neighbor] <- tentativeG
      fScore[neighbor] <- tentativeG + manhattan(neighbor, goal)
      add or update neighbor in open`,
    note: "A* combines the real travel cost so far with Manhattan distance so the frontier stays focused on promising cells."
  }
};

const TOOL_META = {
  wall: {
    title: "Draw Walls",
    hint: "Click or drag across the grid to paint barriers while keeping the start and goal open."
  },
  erase: {
    title: "Erase",
    hint: "Sweep across the maze to remove walls and open up new routes."
  },
  start: {
    title: "Place Start",
    hint: "Click any open cell to move the search origin."
  },
  goal: {
    title: "Place Goal",
    hint: "Click any open cell to move the destination."
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
  dragTool: null
};

const elements = {
  labelInput: document.querySelector("#labelInput"),
  runSearchBtn: document.querySelector("#runSearchBtn"),
  loadChallengeBtn: document.querySelector("#loadChallengeBtn"),
  heroChallengeBtn: document.querySelector("#heroChallengeBtn"),
  applyChallengeBtn: document.querySelector("#applyChallengeBtn"),
  clearBoardBtn: document.querySelector("#clearBoardBtn"),
  randomMazeBtn: document.querySelector("#randomMazeBtn"),
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
  challengeTitle: document.querySelector("#challengeTitle"),
  challengeMode: document.querySelector("#challengeMode"),
  challengePrompt: document.querySelector("#challengePrompt"),
  challengeHint: document.querySelector("#challengeHint"),
  challengeMeta: document.querySelector("#challengeMeta"),
  historyList: document.querySelector("#historyList"),
  toast: document.querySelector("#toast"),
  toolTitle: document.querySelector("#toolTitle"),
  toolHint: document.querySelector("#toolHint"),
  boardStats: document.querySelector("#boardStats"),
  pseudocodeTitle: document.querySelector("#pseudocodeTitle"),
  pseudocodeCode: document.querySelector("#pseudocodeCode"),
  pseudocodeNote: document.querySelector("#pseudocodeNote"),
  segmentButtons: document.querySelectorAll(".segment-button"),
  toolButtons: document.querySelectorAll(".tool-button"),
  challengePanel: document.querySelector(".challenge-panel")
};

const cellElements = new Map();

function cloneCell(cell) {
  return { row: cell.row, col: cell.col };
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

function cellsEqual(first, second) {
  return first.row === second.row && first.col === second.col;
}

function sortCells(cells) {
  return [...cells].sort((first, second) => {
    if (first.row !== second.row) {
      return first.row - second.row;
    }

    return first.col - second.col;
  });
}

function createBoardFromSnapshot(snapshot) {
  const walls = Array.isArray(snapshot?.walls) ? snapshot.walls.map((cell) => cloneCell(cell)) : [];

  return {
    gridSize: {
      rows: Number(snapshot?.gridSize?.rows) || GRID_ROWS,
      cols: Number(snapshot?.gridSize?.cols) || GRID_COLS
    },
    start: cloneCell(snapshot?.start || { row: 1, col: 1 }),
    goal: cloneCell(snapshot?.goal || { row: 10, col: 10 }),
    wallSet: new Set(walls.map((cell) => cellKey(cell)))
  };
}

function createDefaultBoard() {
  return createBoardFromSnapshot({
    gridSize: { rows: GRID_ROWS, cols: GRID_COLS },
    start: { row: 1, col: 1 },
    goal: { row: 10, col: 10 },
    walls: []
  });
}

function serializeBoard(board) {
  return {
    gridSize: { rows: board.gridSize.rows, cols: board.gridSize.cols },
    start: cloneCell(board.start),
    goal: cloneCell(board.goal),
    walls: sortCells(Array.from(board.wallSet, (key) => keyToCell(key)))
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cellLabel(cell) {
  return `row ${cell.row + 1}, col ${cell.col + 1}`;
}

function algorithmLabel(algorithm) {
  return ALGORITHM_META[algorithm]?.label || algorithm.toUpperCase();
}

function getPaletteClass(palette) {
  if (palette === "lagoon") {
    return "chip-lagoon";
  }

  if (palette === "comet") {
    return "chip-comet";
  }

  return "chip-sunrise";
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
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
}

function resetResult() {
  stopPlayback();
  state.result = null;
  state.currentStepIndex = -1;
}

function getVisibleStep() {
  if (!state.result || state.currentStepIndex < 0) {
    return null;
  }

  return state.result.steps[state.currentStepIndex] || null;
}

function getBoardOverlayState() {
  const overlay = {
    visited: new Set(),
    frontier: new Set(),
    path: new Set(),
    activeKey: "",
    fresh: new Set()
  };

  const visibleStep = getVisibleStep();

  if (!state.result || !visibleStep) {
    return overlay;
  }

  for (let index = 0; index <= state.currentStepIndex; index += 1) {
    const step = state.result.steps[index];

    if (step.kind === "expand" && step.current) {
      overlay.visited.add(cellKey(step.current));
    }
  }

  overlay.frontier = new Set((visibleStep.frontier || []).map((cell) => cellKey(cell)));
  overlay.path = new Set((visibleStep.path || []).map((cell) => cellKey(cell)));
  overlay.activeKey = visibleStep.current ? cellKey(visibleStep.current) : "";

  if (visibleStep.kind === "start" && visibleStep.current) {
    overlay.frontier.add(cellKey(visibleStep.current));
  }

  if ((visibleStep.kind === "expand" || visibleStep.kind === "path") && visibleStep.current) {
    overlay.fresh.add(cellKey(visibleStep.current));
  }

  return overlay;
}

function buildGridBoard() {
  const fragment = document.createDocumentFragment();

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const cell = document.createElement("button");
      const key = cellKey({ row, col });

      cell.type = "button";
      cell.className = "grid-cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.dataset.key = key;
      cell.addEventListener("pointerdown", handleCellPointerDown);
      cell.addEventListener("pointerenter", handleCellPointerEnter);
      fragment.append(cell);
      cellElements.set(key, cell);
    }
  }

  elements.gridBoard.innerHTML = "";
  elements.gridBoard.append(fragment);
}

function describeCell(cell, flags) {
  const parts = [cellLabel(cell)];

  if (flags.isStart) {
    parts.push("start");
  }

  if (flags.isGoal) {
    parts.push("goal");
  }

  if (flags.isWall) {
    parts.push("wall");
  }

  if (flags.isPath) {
    parts.push("final path");
  } else if (flags.isFrontier) {
    parts.push("frontier");
  } else if (flags.isVisited) {
    parts.push("visited");
  }

  if (flags.isActive) {
    parts.push("active");
  }

  return parts.join(", ");
}

function renderBoard() {
  const overlay = getBoardOverlayState();

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const cell = { row, col };
      const key = cellKey(cell);
      const button = cellElements.get(key);
      const isStart = cellsEqual(cell, state.board.start);
      const isGoal = cellsEqual(cell, state.board.goal);
      const isWall = state.board.wallSet.has(key);
      const isPath = overlay.path.has(key);
      const isFrontier = overlay.frontier.has(key);
      const isVisited = overlay.visited.has(key);
      const isActive = overlay.activeKey === key;
      const isFresh = overlay.fresh.has(key);
      const classes = ["grid-cell"];
      let token = "";

      if (isWall) {
        classes.push("is-wall");
      }

      if (isVisited) {
        classes.push("is-visited");
      }

      if (isFrontier) {
        classes.push("is-frontier");
      }

      if (isPath) {
        classes.push("is-path");
      }

      if (isStart) {
        classes.push("is-start");
        token = "S";
      }

      if (isGoal) {
        classes.push("is-goal");
        token = "G";
      }

      if (isActive) {
        classes.push("is-active");
      }

      if (isFresh) {
        classes.push("is-fresh");
      }

      button.className = classes.join(" ");
      button.innerHTML = `
        <span class="cell-token">${token}</span>
        <span class="cell-coord">${row + 1},${col + 1}</span>
      `;
      button.setAttribute(
        "aria-label",
        describeCell(cell, {
          isStart,
          isGoal,
          isWall,
          isPath,
          isFrontier,
          isVisited,
          isActive
        })
      );
    }
  }
}

function renderAlgorithmSelection() {
  elements.segmentButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.algorithm === state.algorithm);
  });
}

function renderToolSelection() {
  elements.toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === state.tool);
  });
}

function renderBoardStats() {
  const wallCount = state.board.wallSet.size;
  const openCells = GRID_ROWS * GRID_COLS - wallCount;

  elements.boardStats.textContent = `${GRID_ROWS} x ${GRID_COLS} grid, ${wallCount} walls, ${openCells} open cells. Start ${cellLabel(state.board.start)}. Goal ${cellLabel(state.board.goal)}.`;
}

function renderProgress() {
  if (!state.result) {
    elements.progressFill.style.width = "0%";
    elements.progressText.textContent = `${GRID_ROWS} x ${GRID_COLS} board ready. Pick an algorithm and launch the search.`;
    return;
  }

  const totalSteps = state.result.steps.length || 1;
  const currentStepNumber = Math.max(state.currentStepIndex + 1, 1);
  const progressPercent = (currentStepNumber / totalSteps) * 100;

  elements.progressFill.style.width = `${progressPercent}%`;
  elements.progressText.textContent = `Trace step ${currentStepNumber} of ${totalSteps}. ${state.result.summary}`;
}

function renderMetrics() {
  const visibleStep = getVisibleStep();
  const selectedMeta = ALGORITHM_META[state.algorithm];
  const pathValue =
    visibleStep && (visibleStep.kind === "path" || (visibleStep.kind === "result" && visibleStep.found))
      ? String(visibleStep.pathLength)
      : "--";

  elements.algorithmValue.textContent = state.result
    ? algorithmLabel(state.result.algorithm)
    : selectedMeta.label;
  elements.visitedValue.textContent = visibleStep ? String(visibleStep.visitedCount || 0) : "0";
  elements.pathValue.textContent = pathValue;
  elements.stepValue.textContent = state.result
    ? `${Math.max(state.currentStepIndex + 1, 1)} / ${state.result.steps.length}`
    : "0 / 0";
  elements.heuristicValue.textContent = state.result
    ? state.result.heuristicLabel
    : selectedMeta.heuristic;
}

function renderNarration() {
  const visibleStep = getVisibleStep();

  if (!state.result || !visibleStep) {
    elements.messageTitle.textContent = "Narration";
    elements.messageBody.textContent = "Edit the maze, choose an algorithm, and launch a run.";
    elements.messageInsight.textContent = ALGORITHM_META[state.algorithm].note;
    elements.statusBadge.textContent = "Ready for a run";
    elements.statusBadge.className = "status-badge idle";
    return;
  }

  if (visibleStep.kind === "result") {
    elements.messageTitle.textContent = visibleStep.found ? "Mission Complete" : "No Route Found";
    elements.messageBody.textContent = visibleStep.message;
    elements.messageInsight.textContent = visibleStep.insight;
    elements.statusBadge.textContent = visibleStep.found ? "Path Found" : "Goal Blocked";
    elements.statusBadge.className = `status-badge ${visibleStep.found ? "found" : "missed"}`;
    return;
  }

  if (visibleStep.kind === "path") {
    elements.messageTitle.textContent = "Route Reveal";
  } else if (visibleStep.kind === "start") {
    elements.messageTitle.textContent = "Search Primed";
  } else {
    elements.messageTitle.textContent = "Frontier Update";
  }

  elements.messageBody.textContent = visibleStep.message;
  elements.messageInsight.textContent = visibleStep.insight;
  elements.statusBadge.textContent = "Search in Motion";
  elements.statusBadge.className = "status-badge running";
}

function renderHistory() {
  if (!state.history.length) {
    elements.historyList.innerHTML = `
      <div class="empty-history">
        No runs yet. Launch a search and your server-side activity feed will appear here.
      </div>
    `;
    return;
  }

  elements.historyList.innerHTML = state.history
    .map((entry) => {
      const label = escapeHtml(entry.label);
      const algorithm = escapeHtml(algorithmLabel(entry.algorithm));
      const displayTime = escapeHtml(entry.displayTime);
      const visited = Number(entry.visitedCount) || 0;
      const pathLength = Number(entry.pathLength) || 0;

      return `
        <article class="history-item">
          <header>
            <strong>${label}</strong>
            <span class="history-pill ${entry.found ? "found" : "missed"}">
              ${entry.found ? "Found" : "Blocked"}
            </span>
          </header>
          <div class="history-meta">
            <span>${algorithm}</span>
            <span>${visited} visited</span>
          </div>
          <div class="history-meta">
            <span>${entry.found ? `${pathLength} move${pathLength === 1 ? "" : "s"}` : "No route"}</span>
            <span>${displayTime}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderChallenge() {
  if (!state.challenge) {
    elements.challengeTitle.textContent = "Loading mission...";
    elements.challengeMode.textContent = "solvable";
    elements.challengeMode.className = "chip chip-sunrise";
    elements.challengePrompt.textContent = "Fetching a backend-generated maze challenge for the studio.";
    elements.challengeHint.textContent =
      "The same challenge maze can be reused for BFS, DFS, and A* so the comparison stays fair.";
    elements.challengeMeta.textContent = `${GRID_ROWS} x ${GRID_COLS} grid`;
    return;
  }

  elements.challengeTitle.textContent = state.challenge.title;
  elements.challengeMode.textContent = state.challenge.mode;
  elements.challengeMode.className = `chip ${getPaletteClass(state.challenge.palette)}`;
  elements.challengePrompt.textContent = state.challenge.prompt;
  elements.challengeHint.textContent = state.challenge.hint;
  elements.challengeMeta.textContent = `${state.challenge.wallCount} walls. Start ${cellLabel(
    state.challenge.start
  )}. Goal ${cellLabel(state.challenge.goal)}.`;
}

function renderPseudocode() {
  const meta = ALGORITHM_META[state.algorithm];

  elements.pseudocodeTitle.textContent = meta.title;
  elements.pseudocodeCode.textContent = meta.pseudocode;
  elements.pseudocodeNote.textContent = meta.note;
}

function renderToolGuidance() {
  const meta = TOOL_META[state.tool];

  elements.toolTitle.textContent = meta.title;
  elements.toolHint.textContent = meta.hint;
}

function renderControls() {
  const hasResult = Boolean(state.result);
  const maxIndex = hasResult ? state.result.steps.length - 1 : -1;

  elements.prevStepBtn.disabled = !hasResult || state.currentStepIndex <= 0;
  elements.nextStepBtn.disabled = !hasResult || state.currentStepIndex >= maxIndex;
  elements.playPauseBtn.disabled = !hasResult;
  elements.playPauseBtn.textContent = state.isPlaying ? "Pause" : "Auto Play";
}

function renderAll() {
  renderAlgorithmSelection();
  renderToolSelection();
  renderToolGuidance();
  renderBoardStats();
  renderProgress();
  renderBoard();
  renderMetrics();
  renderNarration();
  renderHistory();
  renderChallenge();
  renderPseudocode();
  renderControls();
}

function applyToolToCell(cell, tool, options = {}) {
  const key = cellKey(cell);
  const quiet = Boolean(options.quiet);

  if (tool === "wall") {
    if (cellsEqual(cell, state.board.start) || cellsEqual(cell, state.board.goal)) {
      if (!quiet) {
        showToast("Start and goal must stay open.");
      }

      return false;
    }

    if (state.board.wallSet.has(key)) {
      return false;
    }

    state.board.wallSet.add(key);
    resetResult();
    return true;
  }

  if (tool === "erase") {
    if (!state.board.wallSet.has(key)) {
      return false;
    }

    state.board.wallSet.delete(key);
    resetResult();
    return true;
  }

  if (tool === "start") {
    if (cellsEqual(cell, state.board.goal)) {
      if (!quiet) {
        showToast("Start and goal need different cells.");
      }

      return false;
    }

    if (cellsEqual(cell, state.board.start)) {
      return false;
    }

    state.board.wallSet.delete(key);
    state.board.start = cloneCell(cell);
    resetResult();
    return true;
  }

  if (tool === "goal") {
    if (cellsEqual(cell, state.board.start)) {
      if (!quiet) {
        showToast("Start and goal need different cells.");
      }

      return false;
    }

    if (cellsEqual(cell, state.board.goal)) {
      return false;
    }

    state.board.wallSet.delete(key);
    state.board.goal = cloneCell(cell);
    resetResult();
    return true;
  }

  return false;
}

function readCellFromEvent(event) {
  return {
    row: Number(event.currentTarget.dataset.row),
    col: Number(event.currentTarget.dataset.col)
  };
}

function handleCellPointerDown(event) {
  event.preventDefault();
  state.isPointerDown = true;
  state.dragTool = state.tool === "wall" || state.tool === "erase" ? state.tool : null;

  if (applyToolToCell(readCellFromEvent(event), state.tool)) {
    renderAll();
  }
}

function handleCellPointerEnter(event) {
  if (!state.isPointerDown || !state.dragTool) {
    return;
  }

  if (applyToolToCell(readCellFromEvent(event), state.dragTool, { quiet: true })) {
    renderAll();
  }
}

function handlePointerUp() {
  state.isPointerDown = false;
  state.dragTool = null;
}

function setAlgorithm(algorithm) {
  if (!ALGORITHM_META[algorithm] || algorithm === state.algorithm) {
    return;
  }

  state.algorithm = algorithm;
  renderAll();
}

function setTool(tool) {
  if (!TOOL_META[tool] || tool === state.tool) {
    return;
  }

  state.tool = tool;
  renderAll();
}

function clearBoard() {
  if (!state.board.wallSet.size) {
    showToast("The board is already clear.");
    return;
  }

  state.board.wallSet.clear();
  resetResult();
  renderAll();
  showToast("Walls cleared.");
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

async function loadChallenge(options = {}) {
  try {
    state.challenge = await fetchJson("/api/challenge");

    if (options.applyToBoard) {
      applyChallenge({ showToast: false });
    }

    if (options.scrollIntoView) {
      elements.challengePanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    renderAll();
    showToast(options.applyToBoard ? "Fresh challenge generated and applied." : "Fresh challenge generated.");
    return true;
  } catch (error) {
    showToast(error.message);
    return false;
  }
}

function applyChallenge(options = {}) {
  if (!state.challenge) {
    showToast("Load a challenge first.");
    return;
  }

  state.board = createBoardFromSnapshot(state.challenge);
  elements.labelInput.value = state.challenge.title;
  resetResult();
  renderAll();

  if (options.showToast !== false) {
    showToast("Challenge loaded into the board.");
  }
}

async function refreshHistory() {
  try {
    const data = await fetchJson("/api/history");
    state.history = Array.isArray(data.history) ? data.history : [];
    renderHistory();
  } catch (error) {
    showToast(error.message);
  }
}

async function runSearch() {
  stopPlayback();
  elements.runSearchBtn.disabled = true;

  try {
    state.result = await fetchJson("/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        algorithm: state.algorithm,
        gridSize: state.board.gridSize,
        start: state.board.start,
        goal: state.board.goal,
        walls: serializeBoard(state.board).walls,
        label: elements.labelInput.value.trim() || undefined
      })
    });

    state.currentStepIndex = 0;
    renderAll();
    await refreshHistory();
    showToast("Pathfinding run completed. Use Auto Play or step through manually.");
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.runSearchBtn.disabled = false;
    renderControls();
  }
}

function goToStep(offset) {
  if (!state.result) {
    return;
  }

  stopPlayback();
  state.currentStepIndex = Math.min(
    Math.max(state.currentStepIndex + offset, 0),
    state.result.steps.length - 1
  );
  renderAll();
}

function autoPlay() {
  if (!state.result) {
    return;
  }

  if (state.isPlaying) {
    stopPlayback();
    renderControls();
    return;
  }

  if (state.currentStepIndex >= state.result.steps.length - 1) {
    state.currentStepIndex = 0;
  }

  state.isPlaying = true;
  renderControls();

  state.playTimer = window.setInterval(() => {
    if (!state.result || state.currentStepIndex >= state.result.steps.length - 1) {
      stopPlayback();
      renderControls();
      return;
    }

    state.currentStepIndex += 1;
    renderAll();
  }, PLAYBACK_DELAY_MS);
}

async function init() {
  buildGridBoard();

  elements.segmentButtons.forEach((button) => {
    button.addEventListener("click", () => setAlgorithm(button.dataset.algorithm));
  });

  elements.toolButtons.forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });

  elements.runSearchBtn.addEventListener("click", runSearch);
  elements.loadChallengeBtn.addEventListener("click", loadChallenge);
  elements.heroChallengeBtn.addEventListener("click", () =>
    loadChallenge({ scrollIntoView: true })
  );
  elements.applyChallengeBtn.addEventListener("click", applyChallenge);
  elements.clearBoardBtn.addEventListener("click", clearBoard);
  elements.randomMazeBtn.addEventListener("click", () =>
    loadChallenge({ applyToBoard: true })
  );
  elements.prevStepBtn.addEventListener("click", () => goToStep(-1));
  elements.nextStepBtn.addEventListener("click", () => goToStep(1));
  elements.playPauseBtn.addEventListener("click", autoPlay);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", handlePointerUp);

  renderAll();
  await Promise.all([loadChallenge(), refreshHistory()]);
  renderAll();
}

init();
