// Fonction pour générer un ID unique aléatoire (ex: 8x3f9a)
function generateRoomID() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// 1. Créer une partie
document.getElementById("btn-creer").addEventListener("click", function() {
    const roomID = generateRoomID();
    window.location.href = `game.html?room=${roomID}`;
});

// 2. Rejoindre une partie
document.getElementById("btn-rejoindre").addEventListener("click", function() {
    const roomID = prompt("Entrez l'ID de la partie (ex: A8F3K) :");
    if (roomID) {
        window.location.href = `game.html?room=${roomID.trim()}`;
    }
});

// 3. Jouer contre l'IA
document.getElementById("btn-ia").addEventListener("click", function() {
    const roomID = generateRoomID();
    window.location.href = `game.html?room=${roomID}&mode=ia`;
});