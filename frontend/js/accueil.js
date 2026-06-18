document.addEventListener("DOMContentLoaded", () => {
  // 1. On pointe vers un salon factice appelé "ping" pour réveiller le serveur
  const RENDER_WS_URL = "wss://columna.onrender.com/ws/ping"; 

  const checkSocket = new WebSocket(RENDER_WS_URL);

  const banner = document.getElementById("server-status-banner");
  const bannerText = document.getElementById("server-status-text");

  checkSocket.onopen = () => {
    if (banner && bannerText) {
      banner.classList.remove("waiting");
      banner.classList.add("connected");
      bannerText.innerHTML = "Serveur de jeu en ligne ! Prêt à jouer.";

      setTimeout(() => {
        banner.classList.add("hidden-soft");
        
        // 2. NOUVEAU : On referme la connexion proprement pour ne pas 
        // laisser un "joueur fantôme" dans le salon "ping" sur le serveur
        checkSocket.close(); 
        
      }, 2000);
    }
  };

  checkSocket.onerror = (error) => {
    if (bannerText) {
      bannerText.innerText =
        "Impossible de joindre le serveur. Veuillez réessayer plus tard.";
    }
  };
});

// Fonction pour générer un ID unique aléatoire (ex: 8x3f9a)
function generateRoomID() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

let hideJoinInputTimeout = null;
const joinInput = document.getElementById("form-rejoindre");
const submitButton = document.getElementById("btn-submit-rejoindre");

function hideJoinInput() {
  if (!joinInput.value.trim()) {
    joinInput.type = "hidden";
    submitButton.classList.remove("visible");
  }
}

function resetHideJoinInputTimer() {
  if (hideJoinInputTimeout) {
    clearTimeout(hideJoinInputTimeout);
  }
  hideJoinInputTimeout = setTimeout(hideJoinInput, 5000);
}

function joinRoom(event) {
  if (event) event.preventDefault();
  const roomID = joinInput.value;
  joinInput.value = "";
  console.log(roomID);
  if (!roomID || !roomID.trim()) {
    return false;
  }
  window.location.href = `game.html?room=${roomID.trim()}`;
  return false;
}

// 1. Créer une partie
document.getElementById("btn-creer").addEventListener("click", function () {
  const roomID = generateRoomID();
  window.location.href = `game.html?room=${roomID}`;
});

// 2. Rejoindre une partie
document.getElementById("btn-rejoindre").addEventListener("click", function () {
  joinInput.type = "text";
  submitButton.classList.add("visible");
  joinInput.focus();
  resetHideJoinInputTimer();
});

joinInput.addEventListener("input", resetHideJoinInputTimer);
joinInput.addEventListener("focus", resetHideJoinInputTimer);

// 3. Jouer contre l'IA
document.getElementById("btn-ia").addEventListener("click", function () {
  const roomID = generateRoomID();
  window.location.href = `game.html?room=${roomID}&mode=ia`;
});

document.querySelectorAll(".btn").forEach((button) => {
  button.addEventListener("click", () => {
    button.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(.94)" },
        { transform: "scale(1)" },
      ],
      {
        duration: 180,
        easing: "ease-out",
      },
    );
  });
});
