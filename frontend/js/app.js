// Rôle des joueurs
let myRole = null;
let playerId = sessionStorage.getItem("columna_player_id");
if (!playerId) {
  playerId = Math.random().toString(36).substring(2, 15);
  sessionStorage.setItem("columna_player_id", playerId);
}

const urlParams = new URLSearchParams(window.location.search);
const roomID = urlParams.get("room");
document.getElementById("room-display").textContent = roomID;
const mode = urlParams.get("mode") || "multi";
if (!roomID) {
  alert("Aucune partie trouvée. Retour à l'accueil.");
  window.location.href = "index.html";
}

// 2. On ouvre la connexion vers le serveur Python
const socket = new WebSocket(`wss://columna.onrender.com/ws/${roomID}?mode=${mode}&player_id=${playerId}`);

socket.onopen = function () {
  console.log(`Connecté au serveur Python sur le salon : ${roomID}`);
};

socket.onmessage = function (event) {
  const response = JSON.parse(event.data);
  console.log("Mise à jour reçue du serveur :", response);

  if (response.status === "opponent_disconnected") {
    if (myRole !== "spectator") {
      document.getElementById("phase-title").textContent =
        "L'adversaire est déconnecté";
      document.getElementById("phase-desc").textContent =
        "Attendre 30 secondes";
      document.getElementById("disconnect-title").textContent =
        "Votre adversaire a été déconnecté !";
      document.getElementById("disconnect-body").textContent =
        "S'il ne revient pas d'ici 30 secondes, vous remportez la partie";
      document.getElementById("disconnect-modal").classList.add("show");
    }
    return;
  } else if (response.status === "opponent_reconnected") {
    if (myRole !== "spectator") {
      document.getElementById("disconnect-title").textContent =
        "Votre adversaire est de retour !";
      document.getElementById("disconnect-body").textContent =
        "Le combat reprend";
      document.getElementById("disconnect-modal").classList.add("show");
    }
    return;
  } else if (response.status === "victory") {
    gameOver = true;
    updateStatusBar();

    const btnAbandon = document.getElementById("btn-abandon");
    if (btnAbandon) {
      btnAbandon.disabled = true;
      btnAbandon.style.opacity = "0.5";
      btnAbandon.style.cursor = "not-allowed";
    }

    const endModal = document.getElementById("end-modal");
    const modalTitle = document.getElementById("modal-title");
    const modalBody = document.getElementById("modal-body");

    if (endModal && modalTitle && modalBody) {
      modalTitle.innerText = "Partie terminée";

      if (myRole === "spectator") {
        if (response.winner === "white") {
          modalBody.innerHTML = "Les Blancs remportent la partie !";
        } else {
          modalBody.innerHTML = "Les Noirs remportent la partie !";
        }
      } else if (myRole === response.winner) {
        modalTitle.style.color = "var(--gold)";
        modalBody.innerHTML =
          "<strong>Victoire</strong>";
      } else {
        modalBody.innerHTML =
          "<strong>Défaite</strong>";
      }
      endModal.classList.add("show");
    }

    socket.close();
    return;
  }else if (response.status === "victory_by_abandon") {
    gameOver = true;
    updateStatusBar();

    const btnAbandon = document.getElementById("btn-abandon");
    if (btnAbandon) {
      btnAbandon.disabled = true;
      btnAbandon.style.opacity = "0.5";
      btnAbandon.style.cursor = "not-allowed";
    }

    const endModal = document.getElementById("end-modal");
    const modalTitle = document.getElementById("modal-title");
    const modalBody = document.getElementById("modal-body");

    if (myRole === response.winner) {
      modalBody.innerHTML =
        "Votre adversaire a fui !<br><strong>Victoire par forfait</strong>";
    } else {
      modalBody.innerHTML =
        "Vous avez abandonné la partie.<br><strong>Défaite enregistrée</strong>";
    }

    if (endModal && modalTitle && modalBody) {
      modalTitle.innerText = "Partie terminée";

      if (myRole === "spectator") {
        if (response.winner === "white") {
          modalBody.innerHTML = "Les Blancs remportent la partie par forfait !";
        } else {
          modalBody.innerHTML = "Les Noirs remportent la partie par forfait !";
        }
      } else if (myRole === response.winner) {
        modalTitle.style.color = "var(--gold)";
        modalBody.innerHTML =
          "Votre adversaire a fui !<br><strong>Victoire par forfait</strong>";
      } else {
        modalBody.innerHTML =
          "Vous avez abandonné la partie.<br><strong>Défaite</strong>";
      }
      endModal.classList.add("show");
    }

    socket.close();
    return;
  }

  if (response.status === "sync" || response.status === "update") {
    if (response.role) {
      myRole = response.role;
      if (myRole === "white") {
        document.getElementById("score-card-name-white").innerText =
          "Blancs\t(Vous)";
      } else if (myRole === "black") {
        document.getElementById("score-card-name-black").innerText =
          "Noirs\t(Vous)";
      } else {
        document.getElementById("phase-title").innerText = "Spectateur";
        document.getElementById("btn-abandon").style.display = "none";
      }
    }
    const serverState = response.state;
    currentPlayer = serverState.turn;
    phase = serverState.phase;
    selectedCell = null;

    // MAJ des dalles, des pions, des mouvs
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        let h = serverState.dalles[r][c];
        board[r][c].height = h === 0 ? null : h;
        board[r][c].pion = null;
      }
    }

    for (const [r, c] of serverState.white_pawns) {
      board[r][c].pion = "white";
    }

    for (const [r, c] of serverState.black_pawns) {
      board[r][c].pion = "black";
    }

    if (serverState.last_pion_move) {
      lastPionMove = {
        from: serverState.last_pion_move.from,
        to: serverState.last_pion_move.to,
      };
    }
    if (serverState.last_stack_move) {
      lastStackMove = {
        from: serverState.last_stack_move.from,
        to: serverState.last_stack_move.to,
      };
    }

    render();
  }
};

const BOARD_SIZE = 6;
const MAX_PILE = 5;
const INITIAL_PIONS = {
  white: [
    [2, 0],
    [2, 3],
    [0, 5],
    [5, 4],
  ],
  black: [
    [0, 1],
    [3, 2],
    [3, 5],
    [5, 0],
  ],
};

let board = []; // board[r][c] = { height: 0-5 ou null (case vide), pion: null|'white'|'black' }
let currentPlayer = "white";
let phase = "move"; // 'move' | 'stack'
let selectedCell = null;
let gameOver = false;
let lastPionMove = null;
let lastStackMove = null;

function initBoard() {
  board = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    board[r] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      board[r][c] = { height: 1, pion: null };
    }
  }
  for (const [r, c] of INITIAL_PIONS.white) board[r][c].pion = "white";
  for (const [r, c] of INITIAL_PIONS.black) board[r][c].pion = "black";
}

function getOrthNeighbors(r, c) {
  return [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]
    .map(([dr, dc]) => [r + dr, c + dc])
    .filter(
      ([nr, nc]) => nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE,
    );
}

// Renvoie les cases valides pour un pion en coordonnés (r,c)
function validMoveTargets(r, c) {
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const targets = [];
  for (const [dr, dc] of dirs) {
    let nr = r + dr,
      nc = c + dc;
    while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
      const cell = board[nr][nc];
      if (cell.height !== null) {
        if (cell.pion === null) targets.push([nr, nc]);
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
  return targets;
}

// Renvoie les cases valides pour un pile vide en coordonnés (r,c)
function validStackTargets(r, c) {
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const targets = [];
  for (const [dr, dc] of dirs) {
    let nr = r + dr,
      nc = c + dc;
    while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
      const cell = board[nr][nc];
      if (cell.height !== null) {
        if (
          cell.pion === null &&
          cell.height + board[r][c].height <= MAX_PILE
        ) {
          targets.push([nr, nc]);
        }
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
  return targets;
}

function canCurrentPlayerMove() {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c].pion === currentPlayer)
        if (validMoveTargets(r, c).length > 0) return true;
  return false;
}

function canCurrentPlayerStack() {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c].height !== null && board[r][c].pion === null)
        if (validStackTargets(r, c).length > 0) return true;
  return false;
}

function render() {
  const boardEl = document.getElementById("board");
  boardEl.innerHTML = "";

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      const el = document.createElement("div");
      el.className = "cell";
      el.dataset.r = r;
      el.dataset.c = c;

      if (cell.height === null) {
        el.classList.add("empty-cell");
      } else {
        // Dalle unique avec classe hN
        const stackEl = document.createElement("div");
        stackEl.className = `tile-stack h${cell.height}`;
        stackEl.textContent = cell.height;
        el.appendChild(stackEl);

        if (cell.pion) {
          const pionEl = document.createElement("div");
          pionEl.className = `pion ${cell.pion} pion-h${cell.height}`;
          el.appendChild(pionEl);
        }

        if (!gameOver) applyInteractions(el, r, c, cell);
      }

      boardEl.appendChild(el);
    }
  }

  updateStatusBar();
  updateScores();
  drawArrows();
  //   document.getElementById("btn-cancel").style.display = selectedCell? "block": "none";
}

function applyInteractions(el, r, c, cell) {
  if (myRole !== currentPlayer || gameOver) {
    return;
  }
  if (phase === "move") {
    if (selectedCell === null) {
      if (cell.pion === currentPlayer && validMoveTargets(r, c).length > 0) {
        el.classList.add("clickable", "selected-ready");
        el.addEventListener("click", () => selectPion(r, c));
      }
    } else {
      const sr = selectedCell.r,
        sc = selectedCell.c;
      if (r === sr && c === sc) {
        el.classList.add("selected");
        el.classList.add("clickable");
        el.addEventListener("click", cancelSelection);
      } else {
        const targets = validMoveTargets(sr, sc);
        if (targets.some(([tr, tc]) => tr === r && tc === c)) {
          el.classList.add("valid-move", "clickable");
          el.addEventListener("click", () => movePion(sr, sc, r, c));
        } else {
          el.classList.add("clickable");
          el.addEventListener("click", cancelSelection);
        }
      }
    }
  } else if (phase === "stack") {
    if (selectedCell === null) {
      if (cell.pion === null && validStackTargets(r, c).length > 0) {
        el.classList.add("clickable");
        el.addEventListener("click", () => selectStack(r, c));
      } else if (cell.pion === null && validStackTargets(r, c).length === 0) {
        el.classList.add("cant-stack");
      }
    } else {
      const sr = selectedCell.r,
        sc = selectedCell.c;
      if (r === sr && c === sc) {
        el.classList.add("selected");
        el.classList.add("clickable");
        el.addEventListener("click", cancelSelection);
      } else {
        const targets = validStackTargets(sr, sc);
        if (targets.some(([tr, tc]) => tr === r && tc === c)) {
          el.classList.add("valid-stack", "clickable");
          el.addEventListener("click", () => stackTiles(sr, sc, r, c));
        } else {
          el.classList.add("clickable");
          el.addEventListener("click", cancelSelection);
        }
      }
    }
  }
}

function drawArrows() {
  let svgContainer = document.getElementById("arrows-svg");
  if (!svgContainer) {
    const boardWrap = document.querySelector(".board-wrap");
    svgContainer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    svgContainer.id = "arrows-svg";
    svgContainer.style.position = "absolute";
    svgContainer.style.top = "0";
    svgContainer.style.left = "0";
    svgContainer.style.pointerEvents = "none";
    svgContainer.style.overflow = "visible";
    boardWrap.style.position = "relative";
    boardWrap.appendChild(svgContainer);
  }

  svgContainer.innerHTML = "";

  const cellSize = 82;
  const gap = 4;
  const cellWithGap = cellSize + gap;
  const boardPadding = 8;

  function getCellCenter(r, c) {
    const x = boardPadding + c * cellWithGap + cellSize / 2;
    const y = boardPadding + r * cellWithGap + cellSize / 2;
    return { x, y };
  }

  function drawArrow(from, to, color, markerId, strokeDasharray = null) {
    const start = getCellCenter(from[0], from[1]);
    const end = getCellCenter(to[0], to[1]);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", start.x);
    line.setAttribute("y1", start.y);
    line.setAttribute("x2", end.x);
    line.setAttribute("y2", end.y);
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", "3");
    line.setAttribute("marker-end", `url(#${markerId})`);
    if (strokeDasharray) {
      line.setAttribute("stroke-dasharray", strokeDasharray);
    }
    svgContainer.appendChild(line);
  }

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const markerPion = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "marker",
  );
  markerPion.setAttribute("id", "arrowhead-pion");
  markerPion.setAttribute("markerWidth", "10");
  markerPion.setAttribute("markerHeight", "10");
  markerPion.setAttribute("refX", "9");
  markerPion.setAttribute("refY", "3");
  markerPion.setAttribute("orient", "auto");
  const polygonPion = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );
  polygonPion.setAttribute("points", "0 0, 10 3, 0 6");
  polygonPion.setAttribute("fill", "#4A90E2");
  markerPion.appendChild(polygonPion);
  defs.appendChild(markerPion);

  const markerStack = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "marker",
  );
  markerStack.setAttribute("id", "arrowhead-stack");
  markerStack.setAttribute("markerWidth", "10");
  markerStack.setAttribute("markerHeight", "10");
  markerStack.setAttribute("refX", "9");
  markerStack.setAttribute("refY", "3");
  markerStack.setAttribute("orient", "auto");
  const polygonStack = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );
  polygonStack.setAttribute("points", "0 0, 10 3, 0 6");
  polygonStack.setAttribute("fill", "#1dae00");
  markerStack.appendChild(polygonStack);
  defs.appendChild(markerStack);

  svgContainer.appendChild(defs);

  if (lastPionMove) {
    drawArrow(lastPionMove.from, lastPionMove.to, "#4A90E2", "arrowhead-pion");
  }

  if (lastStackMove) {
    drawArrow(
      lastStackMove.from,
      lastStackMove.to,
      "#1dae00",
      "arrowhead-stack",
      "8,4",
    );
  }

  svgContainer.setAttribute(
    "width",
    boardPadding * 2 + BOARD_SIZE * cellWithGap,
  );
  svgContainer.setAttribute(
    "height",
    boardPadding * 2 + BOARD_SIZE * cellWithGap,
  );
}

function selectPion(r, c) {
  selectedCell = { r, c };
  render();
}

function movePion(fr, fc, tr, tc) {
  const message = {
    action: "move",
    from: [fr, fc],
    to: [tr, tc],
  };

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }

  board[tr][tc].pion = board[fr][fc].pion;
  board[fr][fc].pion = null;
  selectedCell = null;
  phase = "stack";
  lastPionMove = { from: [fr, fc], to: [tr, tc] };

  if (!canCurrentPlayerStack()) {
    endGame();
    return;
  }
  render();
}

function selectStack(r, c) {
  selectedCell = { r, c };
  render();
}

function stackTiles(fr, fc, tr, tc) {
  const message = {
    action: "stack",
    from: [fr, fc],
    to: [tr, tc],
  };

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }

  board[tr][tc].height += board[fr][fc].height;
  board[fr][fc].height = null;
  board[fr][fc].pion = null;
  selectedCell = null;
  lastStackMove = { from: [fr, fc], to: [tr, tc] };

  nextTurn();
}

function nextTurn() {
  phase = "move";
  currentPlayer = currentPlayer === "white" ? "black" : "white";

  if (!canCurrentPlayerMove()) {
    endGame();
    return;
  }
  render();
}

function cancelSelection() {
  selectedCell = null;
  render();
}

function copierID() {
  if (roomID) {
    navigator.clipboard
      .writeText(roomID)
      .then(() => {
        const badge = document.getElementById("room-badge-click");
        const originalText = badge.innerHTML;
        badge.innerHTML = "Copié !";
        setTimeout(() => {
          badge.innerHTML = originalText;
        }, 1500);
      })
      .catch((err) => {
        console.error("Impossible de copier l'ID : ", err);
      });
  }
}

let hoverTimer;
const badgeElement = document.getElementById("room-badge-click");
const tooltipElement = document.getElementById("tooltip-message");

badgeElement.addEventListener("mouseenter", () => {
  hoverTimer = setTimeout(() => {
    tooltipElement.classList.add("show");
  }, 1000);
});

badgeElement.addEventListener("mouseleave", () => {
  clearTimeout(hoverTimer);
  tooltipElement.classList.remove("show");
});

function abandonnerPartie() {
  const modalAbandon = document.getElementById("abandon-modal");
  if (modalAbandon) {
    modalAbandon.classList.add("show");
  }
}

function fermerModalAbandon() {
  const modalAbandon = document.getElementById("abandon-modal");
  if (modalAbandon) {
    modalAbandon.classList.remove("show");
  }
}

function confirmerAbandonNetwork() {
  fermerModalAbandon();

  if (socket && socket.readyState === WebSocket.OPEN) {
    const payloadAbandon = {
      action: "abandon",
      role: myRole,
    };

    const btnAbandon = document.getElementById("btn-abandon");
    if (btnAbandon) {
      btnAbandon.disabled = true;
      btnAbandon.style.opacity = "0.5";
      btnAbandon.style.cursor = "not-allowed";
    }

    socket.send(JSON.stringify(payloadAbandon));

    document.getElementById("modal-title").innerText = "Traitement...";
    document.getElementById("modal-body").innerHTML =
      "Enregistrement de l'abandon auprès du serveur...";
    document.getElementById("end-modal").classList.add("show");
  } else {
    console.error(
      "[RÉSEAU] Impossible d'abandonner : le WebSocket est fermé !",
    );
  }
}

function computeScore(color) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c].pion === color && board[r][c].height !== null)
        counts[board[r][c].height]++;
  return counts;
}

function endGame() {
  const ws = computeScore("white");
  const bs = computeScore("black");

  let winner = null;
  let reason = "";
  for (let h = MAX_PILE; h >= 1; h--) {
    if (ws[h] > bs[h]) {
      winner = "white";
      break;
    }
    if (bs[h] > ws[h]) {
      winner = "black";
      break;
    }
  }
  if (!winner) {
    winner = currentPlayer === "white" ? "black" : "white";
    reason = "Égalité parfaite — le joueur bloqué perd";
  }

  render();
  let res = "";
  if (winner === myRole) {
    res = "<strong>Victoire</strong";
  } else {
    res = "<strong>Défaite</strong>";
  }
  document.getElementById("modal-title").textContent = "Partie terminée";
  document.getElementById("modal-body").innerHTML = res;
  document.getElementById("end-modal").classList.add("show");

  const btnAbandon = document.getElementById("btn-abandon");
    if (btnAbandon) {
      btnAbandon.disabled = true;
      btnAbandon.style.opacity = "0.5";
      btnAbandon.style.cursor = "not-allowed";
    }
}

function updateStatusBar() {
  const dot = document.getElementById("current-pion-dot");
  dot.className = "pion-dot " + currentPlayer;
  document.getElementById("current-player-name").textContent =
    currentPlayer === "white" ? "Blancs" : "Noirs";

  const title = document.getElementById("phase-title");
  const desc = document.getElementById("phase-desc");
  if (gameOver) {
    title.textContent = "Partie terminée";
    desc.textContent = "";
  } else if (myRole === "spectator") {
    desc.textContent = "";
  } else if (myRole !== currentPlayer) {
    title.textContent = "En attente de l'adversaire";
    desc.textContent = "Votre adversaire est en train de réfléchir";
  } else if (phase === "move") {
    title.textContent = "Action 1 : Déplacer un pion";
    desc.textContent = "Cliquez sur un de vos pions, puis sa destination";
  } else {
    title.textContent = "Action 2 : Empiler des dalles";
    desc.textContent = "Choisissez une pile (sans pion) à déplacer";
  }
}

function updateScores() {
  for (const color of ["white", "black"]) {
    const counts = computeScore(color);
    const breakdown = document.getElementById(`score-breakdown-${color}`);
    breakdown.innerHTML = "";
    for (let h = MAX_PILE; h >= 1; h--) {
      const pip = document.createElement("div");
      pip.className = "score-pip";
      pip.innerHTML = `<span class="score-pip-num">${counts[h]}</span><span class="score-pip-label">pile${h}</span>`;
      breakdown.appendChild(pip);
    }
    const card = document.getElementById(`score-${color}`);
    card.classList.toggle(
      "active-player",
      color === currentPlayer && !gameOver,
    );
  }
}

function closeEndModal() {
  const endModal = document.getElementById("end-modal");
  if (endModal) {
    endModal.classList.remove("show");
  }
}

function closeDisconnectModal() {
  const disconnectModal = document.getElementById("disconnect-modal");
  if (disconnectModal) {
    disconnectModal.classList.remove("show");
  }
}

function restartGame() {
  gameOver = false;
  currentPlayer = "white";
  phase = "move";
  selectedCell = null;
  document.getElementById("end-modal").classList.remove("show");
  initBoard();
  render();
}

initBoard();
//render();
