// ========== WEBSOCKET & RÉSEAU ==========
let myRole = null; // Stockera 'white', 'black', ou 'spectator'
// 1. 🔒 Création de la "Carte d'Identité" (elle survit au rafraîchissement F5)
let playerId = sessionStorage.getItem('columna_player_id');
if (!playerId) {
    // S'il n'en a pas, on lui crée un ID aléatoire
    playerId = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('columna_player_id', playerId);
}
// 1. On récupère l'ID de la partie dans l'URL (ex: ?room=A8F3K)
const urlParams = new URLSearchParams(window.location.search);
const roomID = urlParams.get('room');
const mode = urlParams.get('mode') || "multi"; // "multi" par défaut si pas précisé
// Si quelqu'un arrive sur la page sans ID, on le renvoie à l'accueil
if (!roomID) {
    alert("Aucune partie trouvée. Retour à l'accueil.");
    window.location.href = "index.html";
}

// 2. On ouvre la connexion vers le serveur Python
const socket = new WebSocket(`wss://columna.onrender.com/ws/${roomID}?mode=${mode}&player_id=${playerId}`);

socket.onopen = function() {
    console.log(`Connecté au serveur Python sur le salon : ${roomID}`);
};

socket.onmessage = function(event) {
    // On traduit le texte JSON reçu en objet JavaScript
    const response = JSON.parse(event.data);
    console.log("Mise à jour reçue du serveur :", response);
    // ==========================================
    // 🚨 NOUVEAU : GESTION DES DÉCONNEXIONS
    // ==========================================
    if (response.status === "opponent_disconnected") {
        alert("⚠️ Votre adversaire a été déconnecté ! S'il ne revient pas d'ici 1 minute, vous remportez la partie.");
        return; // On arrête là
    } 
    else if (response.status === "opponent_reconnected") {
        alert("✅ Votre adversaire est de retour ! Le combat reprend.");
        return;
    }
    else if (response.status === "victory_by_abandon") {
        gameOver = true; // On bloque le plateau en JavaScript
        alert(response.message);
        return;
    }

    if (response.status === "sync" || response.status === "update") {
        // On sauvegarde le rôle quand le serveur nous l'envoie
        if (response.role) {
            myRole = response.role;
            
            // 🍿 NOUVEAU : Message spécifique selon le rôle
            if (myRole === 'spectator') {
                alert("La partie est déjà pleine ! Vous êtes en Mode Spectateur 🍿");
            } else {
                alert("Vous jouez les : " + (myRole === 'white' ? 'Blancs' : 'Noirs'));
            }
        }
        const serverState = response.state;
        currentPlayer = serverState.turn;
        phase = serverState.phase;
        selectedCell = null;
        
        // 1. On met à jour les dalles
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                let h = serverState.dalles[r][c];
                // Dans Python, 0 veut dire vide. Dans JS, null veut dire vide.
                board[r][c].height = h === 0 ? null : h;
                board[r][c].pion = null; // On efface tous les pions provisoirement
            }
        }
        
        // 2. On replace les pions blancs (d'après le serveur)
        for (const [r, c] of serverState.white_pawns) {
            board[r][c].pion = 'white';
        }
        
        // 3. On replace les pions noirs (d'après le serveur)
        for (const [r, c] of serverState.black_pawns) {
            board[r][c].pion = 'black';
        }
        
        // 4. On redessine l'interface
        render();
    }
};



// ... (la suite de ton app.js ne bouge pas pour l'instant)
// ========== ÉTAT DU JEU ==========
const BOARD_SIZE = 6;
const MAX_PILE = 5;

// Position initiale des pions (figure 1)
const INITIAL_PIONS = {
  white: [[2, 0], [2, 3], [0, 5], [5, 4]],
  black: [[0, 1], [3, 2], [3, 5], [5, 0]]
};

let board = []; // board[r][c] = { height: 0-5 ou null (case vide), pion: null|'white'|'black' }
let currentPlayer = 'white';
let phase = 'move'; // 'move' | 'stack'
let selectedCell = null; // {r, c}
let gameOver = false;

function initBoard() {
  board = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    board[r] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      board[r][c] = { height: 1, pion: null };
    }
  }
  for (const [r, c] of INITIAL_PIONS.white) board[r][c].pion = 'white';
  for (const [r, c] of INITIAL_PIONS.black) board[r][c].pion = 'black';
}

// ========== LOGIQUE ==========

function getOrthNeighbors(r, c) {
  return [[-1,0],[1,0],[0,-1],[0,1]].map(([dr,dc]) => [r+dr, c+dc])
    .filter(([nr,nc]) => nr>=0 && nr<BOARD_SIZE && nc>=0 && nc<BOARD_SIZE);
}

// Pour un pion en (r,c), retourne les cases valides de destination
function validMoveTargets(r, c) {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  const targets = [];
  for (const [dr, dc] of dirs) {
    let nr = r+dr, nc = c+dc;
    while (nr>=0 && nr<BOARD_SIZE && nc>=0 && nc<BOARD_SIZE) {
      const cell = board[nr][nc];
      if (cell.height !== null) {
        // première pile rencontrée
        if (cell.pion === null) targets.push([nr, nc]);
        break; // on s'arrête toujours sur la première pile
      }
      nr += dr; nc += dc;
    }
  }
  return targets;
}

// Pour une pile sans pion en (r,c), retourne les cases valides d'empilement
function validStackTargets(r, c) {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  const targets = [];
  for (const [dr, dc] of dirs) {
    let nr = r+dr, nc = c+dc;
    while (nr>=0 && nr<BOARD_SIZE && nc>=0 && nc<BOARD_SIZE) {
      const cell = board[nr][nc];
      if (cell.height !== null) {
        // première pile rencontrée
        if (cell.pion === null && cell.height + board[r][c].height <= MAX_PILE) {
          targets.push([nr, nc]);
        }
        break;
      }
      nr += dr; nc += dc;
    }
  }
  return targets;
}

function canCurrentPlayerMove() {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c].pion === currentPlayer)
        if (validMoveTargets(r,c).length > 0) return true;
  return false;
}

function canCurrentPlayerStack() {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c].height !== null && board[r][c].pion === null)
        if (validStackTargets(r,c).length > 0) return true;
  return false;
}

// ========== RENDU ==========

function render() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.r = r;
      el.dataset.c = c;

      if (cell.height === null) {
        el.classList.add('empty-cell');
      } else {
        // Dalle unique avec classe hN
        const stackEl = document.createElement('div');
        stackEl.className = `tile-stack h${cell.height}`;
        stackEl.textContent = cell.height;
        el.appendChild(stackEl);

        // Pion — décalé selon ombre 3D
        if (cell.pion) {
          const pionEl = document.createElement('div');
          pionEl.className = `pion ${cell.pion}`;
          pionEl.style.bottom = (cell.height * 2 + 22) + 'px';
          pionEl.style.left = '50%';
          pionEl.style.transform = 'translateX(-50%)';
          el.appendChild(pionEl);
        }

        // Interactions
        if (!gameOver) applyInteractions(el, r, c, cell);
      }

      boardEl.appendChild(el);
    }
  }

  updateStatusBar();
  updateScores();
  document.getElementById('btn-cancel').style.display = selectedCell ? 'block' : 'none';
}

function applyInteractions(el, r, c, cell) {
  if (myRole !== currentPlayer || gameOver) {
      return; 
  }
  if (phase === 'move') {
    if (selectedCell === null) {
      // Sélectionner un pion du joueur courant
      if (cell.pion === currentPlayer && validMoveTargets(r,c).length > 0) {
        el.classList.add('clickable', 'selected-ready');
        el.addEventListener('click', () => selectPion(r, c));
      }
    } else {
      const sr = selectedCell.r, sc = selectedCell.c;
      if (r === sr && c === sc) {
        el.classList.add('selected');
        el.classList.add('clickable');
        el.addEventListener('click', cancelSelection);
      } else {
        const targets = validMoveTargets(sr, sc);
        if (targets.some(([tr,tc]) => tr===r && tc===c)) {
          el.classList.add('valid-move', 'clickable');
          el.addEventListener('click', () => movePion(sr, sc, r, c));
        }
        else {
  // clic sur une case non valide → désélectionner
        el.classList.add('clickable');
        el.addEventListener('click', cancelSelection);
        }
      }
    }
  } else if (phase === 'stack') {
    if (selectedCell === null) {
      // Sélectionner une pile sans pion
      if (cell.pion === null && validStackTargets(r,c).length > 0) {
        el.classList.add('clickable');
        el.addEventListener('click', () => selectStack(r, c));
      } else if (cell.pion === null && validStackTargets(r,c).length === 0) {
        el.classList.add('cant-stack');
      }
    } else {
      const sr = selectedCell.r, sc = selectedCell.c;
      if (r === sr && c === sc) {
        el.classList.add('selected');
        el.classList.add('clickable');
        el.addEventListener('click', cancelSelection);
      } else {
        const targets = validStackTargets(sr, sc);
        if (targets.some(([tr,tc]) => tr===r && tc===c)) {
          el.classList.add('valid-stack', 'clickable');
          el.addEventListener('click', () => stackTiles(sr, sc, r, c));
        }
        else {
  // clic sur une case non valide → désélectionner
        el.classList.add('clickable');
        el.addEventListener('click', cancelSelection);
        }
      }
    }
  }
}

// ========== ACTIONS ==========

function selectPion(r, c) {
  selectedCell = {r, c};
  render();
}

function movePion(fr, fc, tr, tc) {
  // 1. On prépare le message JSON pour le serveur
  const message = {
      action: "move",
      from: [fr, fc],
      to: [tr, tc]
  };
  
  // 2. On l'envoie via WebSocket (transformé en texte JSON)
  if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
  }

  // --- Le reste de ton code local existant ---
  board[tr][tc].pion = board[fr][fc].pion;
  board[fr][fc].pion = null;
  selectedCell = null;
  phase = 'stack';

  if (!canCurrentPlayerStack()) {
    endGame();
    return;
  }
  render();
}

function selectStack(r, c) {
  selectedCell = {r, c};
  render();
}

function stackTiles(fr, fc, tr, tc) {
  // 1. On informe le serveur de l'empilement
  const message = {
      action: "stack",
      from: [fr, fc],
      to: [tr, tc]
  };
  
  if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
  }

  // --- Le reste de ton code existant ---
  board[tr][tc].height += board[fr][fc].height;
  board[fr][fc].height = null; 
  board[fr][fc].pion = null;
  selectedCell = null;
  nextTurn();
}

function nextTurn() {
  phase = 'move';
  currentPlayer = currentPlayer === 'white' ? 'black' : 'white';

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

// ========== FIN DE PARTIE ==========

function computeScore(color) {
  const counts = {1:0,2:0,3:0,4:0,5:0};
  for (let r=0; r<BOARD_SIZE; r++)
    for (let c=0; c<BOARD_SIZE; c++)
      if (board[r][c].pion === color && board[r][c].height !== null)
        counts[board[r][c].height]++;
  return counts;
}

function endGame() {
  gameOver = true;
  const ws = computeScore('white');
  const bs = computeScore('black');

  let winner = null;
  let reason = '';
  for (let h = MAX_PILE; h >= 1; h--) {
    if (ws[h] > bs[h]) { winner = 'white'; reason = `Plus de pions sur les piles de ${h}`; break; }
    if (bs[h] > ws[h]) { winner = 'black'; reason = `Plus de pions sur les piles de ${h}`; break; }
  }
  if (!winner) {
    // tie-break : joueur qui ne peut plus jouer perd
    winner = currentPlayer === 'white' ? 'black' : 'white';
    reason = 'Égalité parfaite — le joueur bloqué perd';
  }

  render();
  const wName = winner === 'white' ? 'Blancs' : 'Noirs';
  document.getElementById('modal-title').textContent = `${wName} gagnent !`;
  document.getElementById('modal-body').innerHTML =
    `<strong>${reason}</strong><br><br>` +
    `Blancs : ${Object.entries(ws).filter(([,v])=>v>0).map(([k,v])=>`${v}×pile${k}`).join(', ')||'aucun'}<br>` +
    `Noirs : ${Object.entries(bs).filter(([,v])=>v>0).map(([k,v])=>`${v}×pile${k}`).join(', ')||'aucun'}`;
  document.getElementById('end-modal').classList.add('show');
}

// ========== UI ==========

function updateStatusBar() {
  const dot = document.getElementById('current-pion-dot');
  dot.className = 'pion-dot ' + currentPlayer;
  document.getElementById('current-player-name').textContent = currentPlayer === 'white' ? 'Blancs' : 'Noirs';

  const title = document.getElementById('phase-title');
  const desc = document.getElementById('phase-desc');
  if (gameOver) {
    title.textContent = 'Partie terminée';
    desc.textContent = '';
  } else if (phase === 'move') {
    title.textContent = 'Action 1 : Déplacer un pion';
    desc.textContent = 'Cliquez sur un de vos pions, puis sa destination';
  } else {
    title.textContent = 'Action 2 : Empiler des dalles';
    desc.textContent = 'Choisissez une pile (sans pion) à déplacer';
  }
}

function updateScores() {
  for (const color of ['white', 'black']) {
    const counts = computeScore(color);
    const breakdown = document.getElementById(`score-breakdown-${color}`);
    breakdown.innerHTML = '';
    for (let h = MAX_PILE; h >= 1; h--) {
      const pip = document.createElement('div');
      pip.className = 'score-pip';
      pip.innerHTML = `<span class="score-pip-num">${counts[h]}</span><span class="score-pip-label">pile${h}</span>`;
      if (counts[h] > 0) pip.style.background = h === 5 ? '#2a3a1a' : h === 4 ? '#1a2a3a' : 'var(--surface2)';
      breakdown.appendChild(pip);
    }
    // Active player highlight
    const card = document.getElementById(`score-${color}`);
    card.classList.toggle('active-player', color === currentPlayer && !gameOver);
  }
}

function restartGame() {
  gameOver = false;
  currentPlayer = 'white';
  phase = 'move';
  selectedCell = null;
  document.getElementById('end-modal').classList.remove('show');
  initBoard();
  render();
}

// ========== INIT ==========
initBoard();
render();
