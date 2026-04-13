const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY_SIZE = 1024 * 1024;
const HISTORY_LIMIT = 10;
const GRID_ROWS = 12;
const GRID_COLS = 12;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const DIRECTIONS = [
  { name: "right", rowOffset: 0, colOffset: 1 },
  { name: "down", rowOffset: 1, colOffset: 0 },
  { name: "left", rowOffset: 0, colOffset: -1 },
  { name: "up", rowOffset: -1, colOffset: 0 }
];

const ALGORITHM_META = {
  bfs: {
    label: "BFS",
    complexity: {
      time: "O(V + E)",
      space: "O(V)",
      heuristic: "Not used"
    }
  },
  dfs: {
    label: "DFS",
    complexity: {
      time: "O(V + E)",
      space: "O(V)",
      heuristic: "Not used"
    }
  },
  astar: {
    label: "A*",
    complexity: {
      time: "O(E log V)",
      space: "O(V)",
      heuristic: "Manhattan distance"
    }
  }
};

const CHALLENGE_THEMES = [
  {
    title: "Solar Rail Escape",
    palette: "sunrise",
    promptPrefix: "A molten maze just lit up across the grid.",
    hint: "Run BFS or A* first to see the clean shortest-path baseline, then compare DFS on the exact same board."
  },
  {
    title: "Lagoon Signal Hunt",
    palette: "lagoon",
    promptPrefix: "A cool neon current is weaving through this maze.",
    hint: "Watch how the frontier grows differently in BFS, DFS, and A* even though the board never changes."
  },
  {
    title: "Comet Corridor Run",
    palette: "comet",
    promptPrefix: "A kinetic maze stream has been injected into the lab.",
    hint: "A* uses Manhattan distance to stay goal-focused, while BFS and DFS reveal very different exploration personalities."
  }
];

const FALLBACK_CHALLENGE_BOARD = {
  gridSize: { rows: GRID_ROWS, cols: GRID_COLS },
  start: { row: 1, col: 1 },
  goal: { row: 10, col: 10 },
  walls: [
    { row: 0, col: 3 },
    { row: 1, col: 3 },
    { row: 2, col: 3 },
    { row: 3, col: 1 },
    { row: 3, col: 2 },
    { row: 3, col: 3 },
    { row: 3, col: 5 },
    { row: 3, col: 6 },
    { row: 3, col: 7 },
    { row: 4, col: 7 },
    { row: 5, col: 2 },
    { row: 5, col: 4 },
    { row: 5, col: 5 },
    { row: 5, col: 7 },
    { row: 6, col: 2 },
    { row: 6, col: 7 },
    { row: 7, col: 2 },
    { row: 7, col: 3 },
    { row: 7, col: 7 },
    { row: 8, col: 5 },
    { row: 8, col: 7 },
    { row: 8, col: 8 },
    { row: 9, col: 1 },
    { row: 9, col: 5 },
    { row: 9, col: 8 },
    { row: 10, col: 8 }
  ]
};

const recentRuns = [];

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

function labelForAlgorithm(algorithm) {
  return ALGORITHM_META[algorithm].label;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, fileBuffer, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=300"
  });
  response.end(fileBuffer);
}

function parseRequestBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";
    let totalBytes = 0;

    request.on("data", (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > MAX_BODY_SIZE) {
        reject(new HttpError(413, "Request body is too large."));
        request.destroy();
        return;
      }

      rawBody += chunk;
    });

    request.on("end", () => {
      if (!rawBody.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new HttpError(400, "Body must be valid JSON."));
      }
    });

    request.on("error", reject);
  });
}

function parseGridSize(input) {
  const rows = Number(input?.rows);
  const cols = Number(input?.cols);

  if (!Number.isInteger(rows) || !Number.isInteger(cols)) {
    throw new HttpError(400, "Grid size must include integer rows and cols values.");
  }

  if (rows !== GRID_ROWS || cols !== GRID_COLS) {
    throw new HttpError(400, `Grid size must be exactly ${GRID_ROWS} x ${GRID_COLS}.`);
  }

  return { rows, cols };
}

function parseCell(input, label, gridSize) {
  const row = Number(input?.row);
  const col = Number(input?.col);

  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    throw new HttpError(400, `${label} must include integer row and col values.`);
  }

  if (row < 0 || row >= gridSize.rows || col < 0 || col >= gridSize.cols) {
    throw new HttpError(400, `${label} must stay within the ${gridSize.rows} x ${gridSize.cols} grid.`);
  }

  return { row, col };
}

function normalizeWalls(input, gridSize) {
  if (!Array.isArray(input)) {
    throw new HttpError(400, "Walls must be provided as an array of grid cells.");
  }

  const uniqueCells = new Map();

  input.forEach((cell, index) => {
    const parsedCell = parseCell(cell, `Wall ${index + 1}`, gridSize);
    uniqueCells.set(cellKey(parsedCell), parsedCell);
  });

  return sortCells(Array.from(uniqueCells.values()));
}

function normalizeSearchRequest(body) {
  const algorithm = String(body.algorithm || "").toLowerCase();

  if (!ALGORITHM_META[algorithm]) {
    throw new HttpError(400, "Algorithm must be one of bfs, dfs, or astar.");
  }

  const gridSize = parseGridSize(body.gridSize);
  const start = parseCell(body.start, "Start", gridSize);
  const goal = parseCell(body.goal, "Goal", gridSize);
  const walls = normalizeWalls(body.walls || [], gridSize);
  const wallSet = new Set(walls.map((cell) => cellKey(cell)));

  if (wallSet.has(cellKey(start)) || wallSet.has(cellKey(goal))) {
    throw new HttpError(400, "Start and goal cannot be placed on walls.");
  }

  return {
    algorithm,
    gridSize,
    start,
    goal,
    walls,
    wallSet,
    label:
      typeof body.label === "string" && body.label.trim()
        ? body.label.trim().slice(0, 80)
        : undefined
  };
}

function serializeBoard(board) {
  return {
    gridSize: { rows: board.gridSize.rows, cols: board.gridSize.cols },
    start: cloneCell(board.start),
    goal: cloneCell(board.goal),
    walls: sortCells(board.walls).map((cell) => cloneCell(cell))
  };
}

function cellLabel(cell) {
  return `row ${cell.row + 1}, col ${cell.col + 1}`;
}

function getNeighbors(cell, board) {
  const neighbors = [];

  for (const direction of DIRECTIONS) {
    const nextCell = {
      row: cell.row + direction.rowOffset,
      col: cell.col + direction.colOffset
    };

    if (
      nextCell.row < 0 ||
      nextCell.row >= board.gridSize.rows ||
      nextCell.col < 0 ||
      nextCell.col >= board.gridSize.cols
    ) {
      continue;
    }

    if (board.wallSet.has(cellKey(nextCell))) {
      continue;
    }

    neighbors.push(nextCell);
  }

  return neighbors;
}

function reconstructPath(parents, start, goal) {
  const startKey = cellKey(start);
  const goalKey = cellKey(goal);
  const path = [];
  let currentKey = goalKey;

  while (currentKey) {
    path.push(keyToCell(currentKey));

    if (currentKey === startKey) {
      break;
    }

    currentKey = parents.get(currentKey) || null;
  }

  path.reverse();

  if (!path.length || !cellsEqual(path[0], start)) {
    return [];
  }

  return path;
}

function manhattanDistance(first, second) {
  return Math.abs(first.row - second.row) + Math.abs(first.col - second.col);
}

function createStartStep(algorithm, start) {
  const label = labelForAlgorithm(algorithm);

  return {
    kind: "start",
    current: cloneCell(start),
    frontier: [cloneCell(start)],
    visitedCount: 0,
    pathLength: 0,
    message: `${label} is locked on the start cell at ${cellLabel(start)}.`,
    insight:
      algorithm === "astar"
        ? "A* seeds the open set and scores every move with Manhattan distance."
        : algorithm === "dfs"
          ? "DFS uses a stack, so it keeps diving down the newest branch first."
          : "BFS uses a queue, so it expands the grid one full layer at a time."
  };
}

function createExpandStep({
  algorithm,
  current,
  frontier,
  visitedCount,
  gScore = null,
  hScore = null,
  fScore = null,
  foundGoal = false
}) {
  const label = labelForAlgorithm(algorithm);

  let message = `${label} expanded ${cellLabel(current)}.`;
  let insight = `${frontier.length} frontier cell${frontier.length === 1 ? "" : "s"} remain active.`;

  if (algorithm === "bfs") {
    message = foundGoal
      ? `BFS reached the goal at ${cellLabel(current)} while preserving shortest-path order.`
      : `BFS expanded ${cellLabel(current)} and swept outward level by level.`;
    insight = "Because BFS explores in layers, the first path it finds is the shortest in this unweighted grid.";
  }

  if (algorithm === "dfs") {
    message = foundGoal
      ? `DFS hit the goal at ${cellLabel(current)} while following the current branch.`
      : `DFS expanded ${cellLabel(current)} and kept leaning into its newest branch.`;
    insight = "DFS does not guarantee the shortest path, but it is excellent for showing deep branch exploration.";
  }

  if (algorithm === "astar") {
    message = foundGoal
      ? `A* reached the goal at ${cellLabel(current)} with f = ${fScore}, g = ${gScore}, h = ${hScore}.`
      : `A* expanded ${cellLabel(current)} with f = ${fScore}, g = ${gScore}, h = ${hScore}.`;
    insight = "A* prioritizes cells with the lowest combined travel cost and Manhattan-distance estimate.";
  }

  return {
    kind: "expand",
    current: cloneCell(current),
    frontier: frontier.map((cell) => cloneCell(cell)),
    visitedCount,
    pathLength: 0,
    gScore,
    hScore,
    fScore,
    message,
    insight
  };
}

function createPathSteps(algorithm, path, visitedCount) {
  const label = labelForAlgorithm(algorithm);
  const steps = [];

  path.forEach((cell, index) => {
    const partialPath = path.slice(0, index + 1).map((entry) => cloneCell(entry));
    const pathLength = Math.max(index, 0);

    steps.push({
      kind: "path",
      current: cloneCell(cell),
      frontier: [],
      visitedCount,
      pathLength,
      path: partialPath,
      message:
        pathLength === 0
          ? `${label} is locking the route from the start cell.`
          : `${label} confirmed route step ${pathLength} at ${cellLabel(cell)}.`,
      insight:
        algorithm === "dfs"
          ? "DFS returns the first complete route it discovers, not necessarily the shortest one."
          : "This route is now being revealed as the final answer path."
    });
  });

  return steps;
}

function createResultStep({
  algorithm,
  found,
  visitedCount,
  pathLength,
  path,
  current
}) {
  const label = labelForAlgorithm(algorithm);

  return {
    kind: "result",
    current: current ? cloneCell(current) : null,
    frontier: [],
    visitedCount,
    pathLength,
    path: path.map((cell) => cloneCell(cell)),
    found,
    message: found
      ? `${label} finished with a path of ${pathLength} move${pathLength === 1 ? "" : "s"} after visiting ${visitedCount} node${visitedCount === 1 ? "" : "s"}.`
      : `${label} exhausted the reachable maze after visiting ${visitedCount} node${visitedCount === 1 ? "" : "s"}.`,
    insight: found
      ? "Run the other algorithms on the same maze to compare how their frontiers behave."
      : "The goal is unreachable on this board unless the maze is edited."
  };
}

function runBreadthFirstSearch(board, pushStep) {
  const startKey = cellKey(board.start);
  const goalKey = cellKey(board.goal);
  const parents = new Map([[startKey, null]]);
  const discovered = new Set([startKey]);
  const queue = [cloneCell(board.start)];
  let queueHead = 0;
  let visitedCount = 0;

  while (queueHead < queue.length) {
    const current = queue[queueHead];
    queueHead += 1;
    visitedCount += 1;

    if (cellKey(current) === goalKey) {
      const frontier = queue.slice(queueHead).map((cell) => cloneCell(cell));

      pushStep(
        createExpandStep({
          algorithm: "bfs",
          current,
          frontier,
          visitedCount,
          gScore: 0,
          foundGoal: true
        })
      );

      return {
        found: true,
        visitedCount,
        path: reconstructPath(parents, board.start, board.goal),
        lastCell: current
      };
    }

    for (const neighbor of getNeighbors(current, board)) {
      const neighborKey = cellKey(neighbor);

      if (discovered.has(neighborKey)) {
        continue;
      }

      discovered.add(neighborKey);
      parents.set(neighborKey, cellKey(current));
      queue.push(neighbor);
    }

    pushStep(
      createExpandStep({
        algorithm: "bfs",
        current,
        frontier: queue.slice(queueHead).map((cell) => cloneCell(cell)),
        visitedCount,
        gScore: 0
      })
    );
  }

  return {
    found: false,
    visitedCount,
    path: [],
    lastCell: visitedCount ? queue[queue.length - 1] : board.start
  };
}

function runDepthFirstSearch(board, pushStep) {
  const startKey = cellKey(board.start);
  const goalKey = cellKey(board.goal);
  const parents = new Map([[startKey, null]]);
  const discovered = new Set([startKey]);
  const stack = [cloneCell(board.start)];
  let visitedCount = 0;
  let lastCell = cloneCell(board.start);

  while (stack.length) {
    const current = stack.pop();
    lastCell = current;
    visitedCount += 1;

    if (cellKey(current) === goalKey) {
      pushStep(
        createExpandStep({
          algorithm: "dfs",
          current,
          frontier: stack.map((cell) => cloneCell(cell)),
          visitedCount,
          gScore: 0,
          foundGoal: true
        })
      );

      return {
        found: true,
        visitedCount,
        path: reconstructPath(parents, board.start, board.goal),
        lastCell: current
      };
    }

    const neighbors = getNeighbors(current, board);

    for (let index = neighbors.length - 1; index >= 0; index -= 1) {
      const neighbor = neighbors[index];
      const neighborKey = cellKey(neighbor);

      if (discovered.has(neighborKey)) {
        continue;
      }

      discovered.add(neighborKey);
      parents.set(neighborKey, cellKey(current));
      stack.push(neighbor);
    }

    pushStep(
      createExpandStep({
        algorithm: "dfs",
        current,
        frontier: stack.map((cell) => cloneCell(cell)),
        visitedCount,
        gScore: 0
      })
    );
  }

  return {
    found: false,
    visitedCount,
    path: [],
    lastCell
  };
}

function compareOpenEntries(first, second) {
  if (first.fScore !== second.fScore) {
    return first.fScore - second.fScore;
  }

  if (first.hScore !== second.hScore) {
    return first.hScore - second.hScore;
  }

  return first.order - second.order;
}

function runAStarSearch(board, pushStep) {
  const startKey = cellKey(board.start);
  const goalKey = cellKey(board.goal);
  const parents = new Map([[startKey, null]]);
  const gScores = new Map([[startKey, 0]]);
  const openEntries = [
    {
      key: startKey,
      cell: cloneCell(board.start),
      gScore: 0,
      hScore: manhattanDistance(board.start, board.goal),
      fScore: manhattanDistance(board.start, board.goal),
      order: 0
    }
  ];
  const openMap = new Map([[startKey, openEntries[0]]]);
  const closed = new Set();
  let orderCounter = 1;
  let visitedCount = 0;
  let lastCell = cloneCell(board.start);

  while (openEntries.length) {
    let bestIndex = 0;

    for (let index = 1; index < openEntries.length; index += 1) {
      if (compareOpenEntries(openEntries[index], openEntries[bestIndex]) < 0) {
        bestIndex = index;
      }
    }

    const currentEntry = openEntries.splice(bestIndex, 1)[0];
    openMap.delete(currentEntry.key);

    if (closed.has(currentEntry.key)) {
      continue;
    }

    closed.add(currentEntry.key);
    visitedCount += 1;
    lastCell = currentEntry.cell;

    if (currentEntry.key === goalKey) {
      pushStep(
        createExpandStep({
          algorithm: "astar",
          current: currentEntry.cell,
          frontier: openEntries.map((entry) => cloneCell(entry.cell)),
          visitedCount,
          gScore: currentEntry.gScore,
          hScore: currentEntry.hScore,
          fScore: currentEntry.fScore,
          foundGoal: true
        })
      );

      return {
        found: true,
        visitedCount,
        path: reconstructPath(parents, board.start, board.goal),
        lastCell: currentEntry.cell
      };
    }

    for (const neighbor of getNeighbors(currentEntry.cell, board)) {
      const neighborKey = cellKey(neighbor);

      if (closed.has(neighborKey)) {
        continue;
      }

      const tentativeG = currentEntry.gScore + 1;
      const bestKnownG = gScores.get(neighborKey);

      if (bestKnownG !== undefined && tentativeG >= bestKnownG) {
        continue;
      }

      gScores.set(neighborKey, tentativeG);
      parents.set(neighborKey, currentEntry.key);

      const hScore = manhattanDistance(neighbor, board.goal);
      const existingEntry = openMap.get(neighborKey);

      if (existingEntry) {
        existingEntry.cell = neighbor;
        existingEntry.gScore = tentativeG;
        existingEntry.hScore = hScore;
        existingEntry.fScore = tentativeG + hScore;
      } else {
        const newEntry = {
          key: neighborKey,
          cell: neighbor,
          gScore: tentativeG,
          hScore,
          fScore: tentativeG + hScore,
          order: orderCounter
        };

        orderCounter += 1;
        openEntries.push(newEntry);
        openMap.set(neighborKey, newEntry);
      }
    }

    pushStep(
      createExpandStep({
        algorithm: "astar",
        current: currentEntry.cell,
        frontier: openEntries.map((entry) => cloneCell(entry.cell)),
        visitedCount,
        gScore: currentEntry.gScore,
        hScore: currentEntry.hScore,
        fScore: currentEntry.fScore
      })
    );
  }

  return {
    found: false,
    visitedCount,
    path: [],
    lastCell
  };
}

function runPathfindingSearch(algorithm, board, options = {}) {
  const steps = [];
  const includeTrace = options.includeTrace !== false;
  const pushStep = (step) => {
    if (includeTrace) {
      steps.push(step);
    }
  };

  pushStep(createStartStep(algorithm, board.start));

  if (cellsEqual(board.start, board.goal)) {
    const path = [cloneCell(board.start)];
    const visitedCount = 1;

    createPathSteps(algorithm, path, visitedCount).forEach((step) => pushStep(step));
    pushStep(
      createResultStep({
        algorithm,
        found: true,
        visitedCount,
        pathLength: 0,
        path,
        current: board.goal
      })
    );

    return {
      runId: randomUUID(),
      algorithm,
      found: true,
      visitedCount,
      pathLength: 0,
      path,
      steps,
      summary: `${labelForAlgorithm(algorithm)} finished instantly because the start cell already matched the goal.`,
      complexity: { ...ALGORITHM_META[algorithm].complexity },
      heuristicLabel: ALGORITHM_META[algorithm].complexity.heuristic,
      board: serializeBoard(board)
    };
  }

  const searchResult =
    algorithm === "bfs"
      ? runBreadthFirstSearch(board, pushStep)
      : algorithm === "dfs"
        ? runDepthFirstSearch(board, pushStep)
        : runAStarSearch(board, pushStep);

  const path = searchResult.path.map((cell) => cloneCell(cell));
  const pathLength = path.length ? path.length - 1 : 0;

  if (searchResult.found) {
    createPathSteps(algorithm, path, searchResult.visitedCount).forEach((step) => pushStep(step));
  }

  pushStep(
    createResultStep({
      algorithm,
      found: searchResult.found,
      visitedCount: searchResult.visitedCount,
      pathLength,
      path,
      current: searchResult.lastCell
    })
  );

  return {
    runId: randomUUID(),
    algorithm,
    found: searchResult.found,
    visitedCount: searchResult.visitedCount,
    pathLength,
    path,
    steps,
    summary: searchResult.found
      ? `${labelForAlgorithm(algorithm)} reached the goal after visiting ${searchResult.visitedCount} node${searchResult.visitedCount === 1 ? "" : "s"} and building a path of ${pathLength} move${pathLength === 1 ? "" : "s"}.`
      : `${labelForAlgorithm(algorithm)} visited ${searchResult.visitedCount} node${searchResult.visitedCount === 1 ? "" : "s"} and confirmed that the goal is unreachable on this maze.`,
    complexity: { ...ALGORITHM_META[algorithm].complexity },
    heuristicLabel: ALGORITHM_META[algorithm].complexity.heuristic,
    board: serializeBoard(board)
  };
}

function createHistoryEntry(result, label) {
  const timestamp = new Date();

  return {
    id: result.runId,
    label: label || `${labelForAlgorithm(result.algorithm)} Studio Run`,
    algorithm: result.algorithm,
    found: result.found,
    visitedCount: result.visitedCount,
    pathLength: result.pathLength,
    timestamp: timestamp.toISOString(),
    displayTime: timestamp.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit"
    })
  };
}

function storeHistory(entry) {
  recentRuns.unshift(entry);

  while (recentRuns.length > HISTORY_LIMIT) {
    recentRuns.pop();
  }
}

function createBoardFromChallenge(boardSnapshot) {
  return {
    gridSize: { rows: boardSnapshot.gridSize.rows, cols: boardSnapshot.gridSize.cols },
    start: cloneCell(boardSnapshot.start),
    goal: cloneCell(boardSnapshot.goal),
    walls: boardSnapshot.walls.map((cell) => cloneCell(cell)),
    wallSet: new Set(boardSnapshot.walls.map((cell) => cellKey(cell)))
  };
}

function createRandomChallengeBoard() {
  const startGoalPairs = [
    [
      { row: 1, col: 1 },
      { row: 10, col: 10 }
    ],
    [
      { row: 1, col: 10 },
      { row: 10, col: 1 }
    ],
    [
      { row: 0, col: 2 },
      { row: 11, col: 9 }
    ],
    [
      { row: 2, col: 0 },
      { row: 9, col: 11 }
    ]
  ];

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const pair = startGoalPairs[randomInt(0, startGoalPairs.length - 1)];
    const start = cloneCell(pair[0]);
    const goal = cloneCell(pair[1]);
    const wallCount = randomInt(24, 34);
    const wallSet = new Set();

    while (wallSet.size < wallCount) {
      const candidate = {
        row: randomInt(0, GRID_ROWS - 1),
        col: randomInt(0, GRID_COLS - 1)
      };

      if (cellsEqual(candidate, start) || cellsEqual(candidate, goal)) {
        continue;
      }

      if (manhattanDistance(candidate, start) <= 1 || manhattanDistance(candidate, goal) <= 1) {
        continue;
      }

      wallSet.add(cellKey(candidate));
    }

    const walls = sortCells(Array.from(wallSet, (key) => keyToCell(key)));
    const board = {
      gridSize: { rows: GRID_ROWS, cols: GRID_COLS },
      start,
      goal,
      walls,
      wallSet
    };
    const preview = runPathfindingSearch("bfs", board, { includeTrace: false });

    if (preview.found && preview.pathLength >= 10 && preview.visitedCount >= 15) {
      return serializeBoard(board);
    }
  }

  return serializeBoard(createBoardFromChallenge(FALLBACK_CHALLENGE_BOARD));
}

function createChallenge() {
  const theme = CHALLENGE_THEMES[randomInt(0, CHALLENGE_THEMES.length - 1)];
  const board = createRandomChallengeBoard();

  return {
    title: theme.title,
    mode: "solvable",
    palette: theme.palette,
    prompt: `${theme.promptPrefix} Guide the search from ${cellLabel(board.start)} to ${cellLabel(board.goal)} across a 12 x 12 grid.`,
    hint: theme.hint,
    gridSize: board.gridSize,
    start: board.start,
    goal: board.goal,
    walls: board.walls,
    wallCount: board.walls.length
  };
}

async function serveStaticAsset(requestPath, response) {
  const normalizedPath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const safePath = path.normalize(normalizedPath);
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    throw new HttpError(403, "Forbidden path.");
  }

  try {
    const fileBuffer = await fs.readFile(filePath);
    sendFile(response, fileBuffer, filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      if (path.extname(filePath)) {
        response.writeHead(404, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store"
        });
        response.end("Asset not found.");
        return;
      }

      const fallbackPath = path.join(PUBLIC_DIR, "index.html");
      const fallbackBuffer = await fs.readFile(fallbackPath);
      sendFile(response, fallbackBuffer, fallbackPath);
      return;
    }

    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
  const { pathname } = requestUrl;

  try {
    if (request.method === "GET" && pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        app: "Prism Search Lab Pathfinder",
        date: new Date().toISOString()
      });
      return;
    }

    if (request.method === "GET" && pathname === "/api/challenge") {
      sendJson(response, 200, createChallenge());
      return;
    }

    if (request.method === "GET" && pathname === "/api/history") {
      sendJson(response, 200, { history: recentRuns });
      return;
    }

    if (request.method === "POST" && pathname === "/api/search") {
      const body = await parseRequestBody(request);
      const normalizedRequest = normalizeSearchRequest(body);
      const result = runPathfindingSearch(normalizedRequest.algorithm, normalizedRequest);

      storeHistory(createHistoryEntry(result, normalizedRequest.label));
      sendJson(response, 200, result);
      return;
    }

    if (pathname.startsWith("/api/")) {
      throw new HttpError(404, "API route not found.");
    }

    await serveStaticAsset(pathname, response);
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;

    sendJson(response, statusCode, {
      error: error.message || "Unexpected server error."
    });
  }
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log(`Prism Search Lab is live at http://${displayHost}:${PORT}`);
});
