from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json

from board import Board
from player import Player

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

# ==========================================
# ⏱️ LE CHRONOMÈTRE D'ABANDON (60 SECONDES)
# ==========================================
async def abandon_timer(room_id, disconnected_role):
    try:
        await asyncio.sleep(60) # On patiente 1 minute
        
        # Si on arrive ici, c'est que les 60s sont passées et que la tâche n'a pas été annulée !
        if room_id in parties:
            winner = "black" if disconnected_role == "white" else "white"
            parties[room_id]["phase"] = "game_over" # On bloque la partie
            
            new_state = {
                "status": "victory_by_abandon",
                "winner": winner,
                "message": f"Victoire par forfait ! Les {disconnected_role}s ont fui le combat."
            }
            
            # On prévient l'adversaire resté dans le salon
            for client in parties[room_id]["clients"]:
                try:
                    await client.send_json(new_state)
                except:
                    pass
    except asyncio.CancelledError:
        # 🛑 Cette exception est déclenchée si on annule manuellement le chrono (le joueur est revenu)
        pass

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, mode: str = "multi", player_id: str = ""):
    await websocket.accept()
    
    if room_id not in parties:
        parties[room_id] = {
            "board": Board(screen=None),
            "clients": [],
            "turn": "white",
            "phase": "move",
            "mode": mode,
            "ia": Player(color="black", IA=True) if mode == "ia" else None,
            "ws_white": None, 
            "ws_black": None,
            "id_white": None,
            "id_black": None,
            "task_white": None, # ⏱️ Stocke le chrono du joueur Blanc
            "task_black": None  # ⏱️ Stocke le chrono du joueur Noir
        }
    
    p = parties[room_id]
    role = "spectator"

    if player_id:
        if player_id == p["id_white"]:
            role = "white"
            p["ws_white"] = websocket
            # 🛑 LE JOUEUR BLANC EST REVENU : On annule son chrono d'abandon !
            if p["task_white"]:
                p["task_white"].cancel()
                p["task_white"] = None
                for client in p["clients"]:
                    await client.send_json({"status": "opponent_reconnected"})
                    
        elif player_id == p["id_black"]:
            role = "black"
            p["ws_black"] = websocket
            # 🛑 LE JOUEUR NOIR EST REVENU : On annule son chrono d'abandon !
            if p["task_black"]:
                p["task_black"].cancel()
                p["task_black"] = None
                for client in p["clients"]:
                    await client.send_json({"status": "opponent_reconnected"})

    if role == "spectator":
        if mode == "ia":
            if p["id_white"] is None:
                role = "white"
                p["ws_white"] = websocket
                p["id_white"] = player_id
        else:
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
            "state": get_board_state(p)
        })

        while True:
            data = await websocket.receive_json()
            
            if p["turn"] == "white" and websocket != p.get("ws_white"): continue
            if p["turn"] == "black" and websocket != p.get("ws_black"): continue
            if p["phase"] == "game_over": continue # 🔒 Bloque les clics si la partie est finie
                
            if data["action"] in ["move", "stack"]:
                p["board"].move(tuple(data["from"]), tuple(data["to"]))
                
                if data["action"] == "move":
                    p["phase"] = "stack"
                elif data["action"] == "stack":
                    p["phase"] = "move"
                    p["turn"] = "black" if p["turn"] == "white" else "white"
                
                new_state = {
                    "status": "update",
                    "state": get_board_state(p)
                }
                for client in p["clients"]:
                    await client.send_json(new_state)

                if p["mode"] == "ia" and p["turn"] == "black":
                    ia_player = p["ia"]
                    le_board = p["board"]
                    action = await asyncio.to_thread(ia_player.take_action, le_board)
                    
                    if action:
                        move_action, stack_action = action
                        p["board"].move(move_action[0], move_action[1])
                        p["board"].move(stack_action[0], stack_action[1])
                        p["turn"] = "white"
                        p["phase"] = "move"
                        
                        new_state_ia = {
                            "status": "update",
                            "state": get_board_state(p)
                        }
                        for client in p["clients"]:
                            await client.send_json(new_state_ia)

    except Exception as e:
        # ==========================================
        # 🔌 QUAND UN CÂBLE SE DÉBRANCHE
        # ==========================================
        if websocket in p["clients"]:
            p["clients"].remove(websocket)
            
        disc_role = None
        if websocket == p.get("ws_white"):
            disc_role = "white"
            p["ws_white"] = None
        elif websocket == p.get("ws_black"):
            disc_role = "black"
            p["ws_black"] = None
            
        # Si c'est un vrai joueur qui part (pas un spectateur)
        if disc_role:
            # 1. On prévient l'adversaire
            for client in p["clients"]:
                try:
                    await client.send_json({"status": "opponent_disconnected"})
                except:
                    pass
            # 2. ⏱️ ON LANCE LE CHRONO !
            p[f"task_{disc_role}"] = asyncio.create_task(abandon_timer(room_id, disc_role))