let bannerGone = false;

document.addEventListener("DOMContentLoaded", () => {
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
        checkSocket.close();
        setTimeout(() => {
          bannerGone = true;
        }, 500);
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
    if (window.innerWidth <= 650) {
      const formSection = joinInput.closest("section");
      formSection.style.position = "";
      formSection.style.top = "";
      formSection.style.left = "";
      formSection.style.transform = "";
      formSection.style.width = "";
      formSection.style.zIndex = "";
      formSection.style.marginTop = "";
      document.querySelector("details").style.marginTop = "";
      document.getElementById("btn-ia").style.marginTop = "";
    }
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

// Créer une partie
document.getElementById("btn-creer").addEventListener("click", function () {
  const roomID = generateRoomID();
  window.location.href = `game.html?room=${roomID}`;
});

// Rejoindre une partie
document.getElementById("btn-rejoindre").addEventListener("click", function () {
  if (!bannerGone) return;
  joinInput.type = "text";
  submitButton.classList.add("visible");
  joinInput.focus();
  resetHideJoinInputTimer();

  if (window.innerWidth <= 650) {
    const rect = document
      .getElementById("btn-rejoindre")
      .getBoundingClientRect();
    const formSection = joinInput.closest("section");
    formSection.style.position = "absolute";
    const bodyRect = document.body.getBoundingClientRect();
    formSection.style.top = rect.bottom - bodyRect.top + 45 + "px";
    formSection.style.left = "50%";
    formSection.style.transform = "translateX(-50%)";
    formSection.style.width = "90%";
    formSection.style.zIndex = "10";
    formSection.style.marginTop = "0";
    const formHeight = 60;
    document.getElementById("btn-ia").style.marginTop = formHeight + "px";
  }
});

joinInput.addEventListener("input", resetHideJoinInputTimer);
joinInput.addEventListener("focus", resetHideJoinInputTimer);

// Jouer contre l'IA
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
