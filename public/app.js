const state = {
  result: null,
  challenge: null,
  currentStepIndex: -1,
  history: [],
  isPlaying: false,
  playTimer: null,
  toastTimer: null
};

const elements = {
  arrayInput: document.querySelector("#arrayInput"),
  targetInput: document.querySelector("#targetInput"),
  labelInput: document.querySelector("#labelInput"),
  runSearchBtn: document.querySelector("#runSearchBtn"),
  loadChallengeBtn: document.querySelector("#loadChallengeBtn"),
  heroChallengeBtn: document.querySelector("#heroChallengeBtn"),
  applyChallengeBtn: document.querySelector("#applyChallengeBtn"),
  shuffleBtn: document.querySelector("#shuffleBtn"),
  prevStepBtn: document.querySelector("#prevStepBtn"),
  nextStepBtn: document.querySelector("#nextStepBtn"),
  playPauseBtn: document.querySelector("#playPauseBtn"),
  statusBadge: document.querySelector("#statusBadge"),
  progressFill: document.querySelector("#progressFill"),
  progressText: document.querySelector("#progressText"),
  arrayTrack: document.querySelector("#arrayTrack"),
  comparisonsValue: document.querySelector("#comparisonsValue"),
  indexValue: document.querySelector("#indexValue"),
  scanValue: document.querySelector("#scanValue"),
  messageTitle: document.querySelector("#messageTitle"),
  messageBody: document.querySelector("#messageBody"),
  messageInsight: document.querySelector("#messageInsight"),
  challengeTitle: document.querySelector("#challengeTitle"),
  challengeMode: document.querySelector("#challengeMode"),
  challengePrompt: document.querySelector("#challengePrompt"),
  challengeHint: document.querySelector("#challengeHint"),
  historyList: document.querySelector("#historyList"),
  toast: document.querySelector("#toast")
};

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

function parseArrayInputSafely(input) {
  return String(input || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function getCheckSteps() {
  return state.result?.steps.filter((step) => step.kind === "check") || [];
}

function getVisibleStep() {
  if (!state.result || state.currentStepIndex < 0) {
    return null;
  }

  return state.result.steps[state.currentStepIndex] || null;
}

function getVisitedState() {
  const checkSteps = getCheckSteps();
  const visibleChecks = checkSteps.slice(0, Math.max(state.currentStepIndex, 0));
  const activeStep = getVisibleStep();
  const visitedIndices = new Set(visibleChecks.map((step) => step.index));
  let foundIndex = -1;

  visibleChecks.forEach((step) => {
    if (step.isMatch) {
      foundIndex = step.index;
    }
  });

  if (activeStep?.kind === "check" && activeStep.isMatch) {
    foundIndex = activeStep.index;
  }

  return { visitedIndices, activeStep, foundIndex };
}

function renderArrayTrack() {
  const array = state.result?.array || parseArrayInputSafely(elements.arrayInput.value);
  const { visitedIndices, activeStep, foundIndex } = getVisitedState();

  elements.arrayTrack.innerHTML = array
    .map((value, index) => {
      const classes = ["array-cell"];
      let tag = "Idle";

      if (visitedIndices.has(index)) {
        classes.push("checked");
        tag = "Checked";
      }

      if (activeStep?.kind === "check" && activeStep.index === index) {
        classes.push("active");
        tag = "Now";
      }

      if (foundIndex === index) {
        classes.push("found");
        tag = "Found";
      }

      return `
        <article class="${classes.join(" ")}">
          <span class="cell-tag">${tag}</span>
          <strong>${value}</strong>
          <small>index ${index}</small>
        </article>
      `;
    })
    .join("");
}

function renderMetrics() {
  const result = state.result;
  const visibleStep = getVisibleStep();
  const checkSteps = getCheckSteps();
  const checkedCount =
    visibleStep?.kind === "result"
      ? checkSteps.length
      : Math.max(state.currentStepIndex + 1, 0);
  const totalCells = result?.array.length || parseArrayInputSafely(elements.arrayInput.value).length || 0;
  const progressPercent = totalCells ? Math.min((checkedCount / totalCells) * 100, 100) : 0;

  elements.progressFill.style.width = `${progressPercent}%`;
  elements.progressText.textContent = `${checkedCount} / ${totalCells} cells inspected`;
  elements.comparisonsValue.textContent = result ? String(visibleStep?.comparisons ?? 0) : "0";
  elements.indexValue.textContent =
    result && result.found && visibleStep?.kind === "result"
      ? String(result.foundIndex)
      : result && visibleStep?.kind === "check" && visibleStep.isMatch
        ? String(visibleStep.index)
        : "--";
  elements.scanValue.textContent = `${Math.round(progressPercent)}%`;
}

function renderNarration() {
  const result = state.result;
  const visibleStep = getVisibleStep();

  if (!result || !visibleStep) {
    elements.messageTitle.textContent = "Narration";
    elements.messageBody.textContent = "Run the search to watch the algorithm come alive.";
    elements.messageInsight.textContent = "Each step will explain what the algorithm is doing and why.";
    elements.statusBadge.textContent = "Waiting for a run";
    elements.statusBadge.className = "status-badge idle";
    return;
  }

  if (visibleStep.kind === "result") {
    elements.messageTitle.textContent = "Mission Complete";
    elements.messageBody.textContent = visibleStep.message;
    elements.messageInsight.textContent = `${visibleStep.insight} ${result.summary}`;
    elements.statusBadge.textContent = visibleStep.found ? "Target Found" : "Target Missing";
    elements.statusBadge.className = `status-badge ${visibleStep.found ? "found" : "missed"}`;
    return;
  }

  elements.messageTitle.textContent = `Comparison ${visibleStep.comparisons}`;
  elements.messageBody.textContent = visibleStep.message;
  elements.messageInsight.textContent = visibleStep.insight;
  elements.statusBadge.textContent = "Search in Motion";
  elements.statusBadge.className = "status-badge idle";
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
    .map(
      (entry) => `
        <article class="history-item">
          <header>
            <strong>${entry.label}</strong>
            <span class="history-pill ${entry.found ? "found" : "missed"}">
              ${entry.found ? "Found" : "Missed"}
            </span>
          </header>
          <div class="history-meta">
            <span>Target ${entry.target}</span>
            <span>${entry.comparisons} comparison${entry.comparisons === 1 ? "" : "s"}</span>
          </div>
          <div class="history-meta">
            <span>${entry.arrayLength} cells</span>
            <span>${entry.displayTime}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderChallenge() {
  if (!state.challenge) {
    return;
  }

  elements.challengeTitle.textContent = state.challenge.title;
  elements.challengeMode.textContent = state.challenge.mode;
  elements.challengeMode.className = `chip ${
    state.challenge.palette === "sunrise" ? "chip-sunrise" : "chip-lagoon"
  }`;
  elements.challengePrompt.textContent = state.challenge.prompt;
  elements.challengeHint.textContent = state.challenge.hint;
}

function renderControls() {
  const result = state.result;
  const maxIndex = result ? result.steps.length - 1 : -1;

  elements.prevStepBtn.disabled = state.currentStepIndex <= 0;
  elements.nextStepBtn.disabled = !result || state.currentStepIndex >= maxIndex;
  elements.playPauseBtn.disabled = !result;
}

function renderAll() {
  renderArrayTrack();
  renderMetrics();
  renderNarration();
  renderHistory();
  renderChallenge();
  renderControls();
}

function shuffleCurrentArray() {
  const values = parseArrayInputSafely(elements.arrayInput.value);

  if (!values.length) {
    showToast("Add some numbers first, then I can shuffle them.");
    return;
  }

  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }

  elements.arrayInput.value = values.join(", ");
  state.result = null;
  state.currentStepIndex = -1;
  stopPlayback();
  renderAll();
  showToast("Array remixed.");
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

async function loadChallenge() {
  try {
    state.challenge = await fetchJson("/api/challenge");
    renderChallenge();
    showToast("Fresh challenge generated.");
  } catch (error) {
    showToast(error.message);
  }
}

function applyChallenge() {
  if (!state.challenge) {
    showToast("Load a challenge first.");
    return;
  }

  elements.arrayInput.value = state.challenge.array.join(", ");
  elements.targetInput.value = String(state.challenge.target);
  elements.labelInput.value = state.challenge.title;
  state.result = null;
  state.currentStepIndex = -1;
  stopPlayback();
  renderAll();
  showToast("Challenge loaded into the workspace.");
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

async function runSearch() {
  stopPlayback();

  try {
    state.result = await fetchJson("/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        array: elements.arrayInput.value,
        target: elements.targetInput.value,
        label: elements.labelInput.value.trim() || "Custom run"
      })
    });

    state.currentStepIndex = 0;
    renderAll();
    await refreshHistory();
    showToast("Search completed. Use Auto Play or step through manually.");
  } catch (error) {
    showToast(error.message);
  }
}

function goToStep(offset) {
  if (!state.result) {
    return;
  }

  stopPlayback();
  const nextIndex = Math.min(
    Math.max(state.currentStepIndex + offset, 0),
    state.result.steps.length - 1
  );
  state.currentStepIndex = nextIndex;
  renderAll();
}

function autoPlay() {
  if (!state.result) {
    return;
  }

  if (state.isPlaying) {
    stopPlayback();
    return;
  }

  state.isPlaying = true;
  elements.playPauseBtn.textContent = "Pause";

  if (state.currentStepIndex >= state.result.steps.length - 1) {
    state.currentStepIndex = 0;
  }

  renderAll();

  state.playTimer = window.setInterval(() => {
    if (!state.result) {
      stopPlayback();
      return;
    }

    if (state.currentStepIndex >= state.result.steps.length - 1) {
      stopPlayback();
      return;
    }

    state.currentStepIndex += 1;
    renderAll();
  }, 1200);
}

async function init() {
  elements.runSearchBtn.addEventListener("click", runSearch);
  elements.loadChallengeBtn.addEventListener("click", loadChallenge);
  elements.heroChallengeBtn.addEventListener("click", loadChallenge);
  elements.applyChallengeBtn.addEventListener("click", applyChallenge);
  elements.shuffleBtn.addEventListener("click", shuffleCurrentArray);
  elements.prevStepBtn.addEventListener("click", () => goToStep(-1));
  elements.nextStepBtn.addEventListener("click", () => goToStep(1));
  elements.playPauseBtn.addEventListener("click", autoPlay);

  elements.arrayInput.addEventListener("input", () => {
    if (!state.result) {
      renderArrayTrack();
      renderMetrics();
    }
  });

  await Promise.all([loadChallenge(), refreshHistory()]);
  renderAll();
}

init();
