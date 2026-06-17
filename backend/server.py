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

# On ajoute le paramètre "mode" à la connexion
@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, mode: str = "multi"):
    await websocket.accept()
    
    if room_id not in parties:
        print(f"Création de la partie {room_id} (Mode: {mode})")
        parties[room_id] = {
            "board": Board(screen=None),
            "clients": [],
            "turn": "white",
            "phase": "move",
            "mode": mode,
            "ia": Player(color="black", IA=True) if mode == "ia" else None # L'IA joue les Noirs
        }
    
    # 1. Attribuer les couleurs
    nb_joueurs = len(parties[room_id]["clients"])
    
    if parties[room_id]["mode"] == "ia":
        # En mode IA, le joueur humain est toujours Blanc, et personne d'autre ne peut jouer
        role = "white" if nb_joueurs == 0 else "spectator"
    else:
        # En mode Multi, Blanc puis Noir
        if nb_joueurs == 0:
            role = "white"
        elif nb_joueurs == 1:
            role = "black"
        else:
            role = "spectator"
            
    parties[room_id]["clients"].append(websocket)

    try:
        await websocket.send_json({
            "status": "sync",
            "role": role,
            "state": get_board_state(parties[room_id])
        })

        while True:
            data = await websocket.receive_json()
            
            if data["action"] in ["move", "stack"]:
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