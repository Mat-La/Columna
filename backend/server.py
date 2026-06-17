from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json

from board import Board
from player import Player # Import de ton IA

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

parties = {}

def get_board_state(partie):
    return {
        "dalles": partie["board"].dalles,
        "white_pawns": partie["board"].white_pawns,
        "black_pawns": partie["board"].black_pawns,
        "turn": partie["turn"],
        "phase": partie["phase"]
    }

# 🔒 On ajoute player_id aux paramètres attendus
@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, mode: str = "multi", player_id: str = ""):
    await websocket.accept()
    
    if room_id not in parties:
        print(f"Création de la partie {room_id} (Mode: {mode})")
        parties[room_id] = {
            "board": Board(screen=None),
            "clients": [],
            "turn": "white",
            "phase": "move",
            "mode": mode,
            "ia": Player(color="black", IA=True) if mode == "ia" else None,
            "ws_white": None, 
            "ws_black": None,
            "id_white": None, # 🔒 Mémorise l'ID du joueur Blanc
            "id_black": None  # 🔒 Mémorise l'ID du joueur Noir
        }
    
    p = parties[room_id]
    role = "spectator"

    # ==========================================
    # 1. 🔒 TENTATIVE DE RECONNEXION (Si F5)
    # ==========================================
    if player_id:
        if player_id == p["id_white"]:
            role = "white"
            p["ws_white"] = websocket  # On rebranche son nouveau câble
        elif player_id == p["id_black"]:
            role = "black"
            p["ws_black"] = websocket  # On rebranche son nouveau câble

    # ==========================================
    # 2. 🔒 NOUVELLE CONNEXION (S'il n'a pas été reconnu)
    # ==========================================
    if role == "spectator":
        if mode == "ia":
            if p["id_white"] is None:
                role = "white"
                p["ws_white"] = websocket
                p["id_white"] = player_id
        else: # Mode Multijoueur
            if p["id_white"] is None:
                role = "white"
                p["ws_white"] = websocket
                p["id_white"] = player_id
            elif p["id_black"] is None:
                role = "black"
                p["ws_black"] = websocket
                p["id_black"] = player_id
                
    p["clients"].append(websocket)

    try:
        await websocket.send_json({
            "status": "sync",
            "role": role,
            "state": get_board_state(parties[room_id])
        })

        while True:
            data = await websocket.receive_json()
            
            if data["action"] in ["move", "stack"]:
                if parties[room_id]["turn"] == "white" and websocket != parties[room_id].get("ws_white"):
                    continue # On ignore totalement l'action
                if parties[room_id]["turn"] == "black" and websocket != parties[room_id].get("ws_black"):
                    continue # On ignore totalement l'action
                    
                # Si on arrive ici, c'est que c'est le bon joueur. On applique le coup !
                parties[room_id]["board"].move(tuple(data["from"]), tuple(data["to"]))
                
                if data["action"] == "move":
                    parties[room_id]["phase"] = "stack"
                elif data["action"] == "stack":
                    parties[room_id]["phase"] = "move"
                    parties[room_id]["turn"] = "black" if parties[room_id]["turn"] == "white" else "white"
                
                # On diffuse le plateau après l'action de l'humain
                new_state = {
                    "status": "update",
                    "state": get_board_state(parties[room_id])
                }
                for client in parties[room_id]["clients"]:
                    await client.send_json(new_state)

                # ==========================================
                # 🤖 DECLENCHEMENT DE L'IA
                # ==========================================
                if parties[room_id]["mode"] == "ia" and parties[room_id]["turn"] == "black":
                    print("L'IA réfléchit...")
                    
                    # On fait tourner le Minimax dans un thread séparé pour ne pas freezer le serveur
                    ia_player = parties[room_id]["ia"]
                    le_board = parties[room_id]["board"]
                    
                    # L'IA calcule son coup
                    action = await asyncio.to_thread(ia_player.take_action, le_board)
                    
                    if action:
                        move_action, stack_action = action
                        
                        # L'IA applique son mouvement
                        parties[room_id]["board"].move(move_action[0], move_action[1])
                        # L'IA applique son empilement
                        parties[room_id]["board"].move(stack_action[0], stack_action[1])
                        
                        # Fin du tour de l'IA, c'est au tour de l'humain (Blancs)
                        parties[room_id]["turn"] = "white"
                        parties[room_id]["phase"] = "move"
                        
                        print("L'IA a joué :", action)
                        
                        # On diffuse le nouveau plateau après le coup de l'IA
                        new_state_ia = {
                            "status": "update",
                            "state": get_board_state(parties[room_id])
                        }
                        for client in parties[room_id]["clients"]:
                            await client.send_json(new_state_ia)
                    else:
                        print("L'IA n'a plus de coups possibles !")

    except Exception as e:
        parties[room_id]["clients"].remove(websocket)
