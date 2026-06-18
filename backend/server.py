import random
import asyncio
import json
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

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
        "phase": partie["phase"],
        "last_pion_move": partie.get("last_pion_move"),
        "last_stack_move": partie.get("last_stack_move")
    }

# ==========================================
# ⏱️ LE CHRONOMÈTRE D'ABANDON (60 SECONDES)
# ==========================================
async def abandon_timer(room_id, disconnected_role):
    # 1. 🚨 On prévient l'adversaire IMMÉDIATEMENT depuis cette tâche sécurisée
    if room_id in parties:
        for client in parties[room_id]["clients"]:
            try:
                await client.send_json({"status": "opponent_disconnected"})
            except Exception:
                pass
                
    try:
        # 2. ⏱️ On patiente 30 secondes
        await asyncio.sleep(30) 
        
        # 3. 🏁 Si on arrive ici, les 60s sont écoulées, forfait !
        if room_id in parties:
            winner = "black" if disconnected_role == "white" else "white"
            parties[room_id]["phase"] = "game_over" 
            
            new_state = {
                "status": "victory_by_abandon",
                "winner": winner,
            }
            
            for client in parties[room_id]["clients"]:
                try:
                    await client.send_json(new_state)
                except Exception:
                    pass
    except asyncio.CancelledError:
        # 🛑 Cette exception est déclenchée si on annule le chrono (le joueur est revenu)
        pass

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, mode: str = "multi", player_id: str = ""):
    await websocket.accept()
    start_turn = random.choice(["white", "black"])
    if room_id not in parties:
        parties[room_id] = {
            "board": Board(screen=None),
            "clients": [],
            "turn": start_turn,
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
    
    # 🤖 CAS SPÉCIAL : Si on joue contre l'IA, et que le hasard a choisi l'IA (Noirs) pour commencer :
        if mode == "ia" and start_turn == "black":
            ia = parties[room_id]["ia"]
            le_board = parties[room_id]["board"]
            # L'IA joue son tout premier coup instantanément, avant même que l'humain n'affiche la page
            ia.take_action(le_board)
            if getattr(ia, 'action', None):
                m_act, s_act = ia.action
                le_board.move(m_act[0], m_act[1])
                parties[room_id]["last_pion_move"] = {"from": list(m_act[0]), "to": list(m_act[1])}
                le_board.move(s_act[0], s_act[1])
                parties[room_id]["last_stack_move"] = {"from": list(s_act[0]), "to": list(s_act[1])}
                parties[room_id]["turn"] = "white" # La main passe à l'humain
   
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
            if p["phase"] == "game_over": continue 

            if data["action"] == "abandon":
                p["phase"] = "game_over"
                abandon_role = data.get("role")
                winner = "black" if abandon_role == "white" else "white"
                
                new_state = {
                    "status": "victory_by_abandon",
                    "winner": winner,
                }
                for client in p["clients"]:
                    if websocket == client:
                        continue
                    try:
                        await client.send_json(new_state)
                    except Exception:
                        pass
                continue
                
            if data["action"] in ["move", "stack"]:
                p["board"].move(tuple(data["from"]), tuple(data["to"]))
                
                if data["action"] == "move":
                    p["phase"] = "stack"
                    parties[room_id]["last_pion_move"] = {"from": data["from"], "to": data["to"]}
                    parties[room_id]["last_stack_move"] = None
                elif data["action"] == "stack":
                    p["phase"] = "move"
                    p["turn"] = "black" if p["turn"] == "white" else "white"
                    parties[room_id]["last_stack_move"] = {"from": data["from"], "to": data["to"]}
                
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
                        parties[room_id]["last_pion_move"] = {"from": list(move_action[0]), "to": list(move_action[1])}
                        
                        p["board"].move(stack_action[0], stack_action[1])
                        parties[room_id]["last_stack_move"] = {"from": list(stack_action[0]), "to": list(stack_action[1])}
                        p["turn"] = "white"
                        p["phase"] = "move"
                        
                        new_state_ia = {
                            "status": "update",
                            "state": get_board_state(p)
                        }
                        for client in p["clients"]:
                            await client.send_json(new_state_ia)

# ... (Ceci est la fin de la boucle "while True:" et des actions du joueur)

    except Exception as e:
        pass
        
    finally:
        if websocket in p["clients"]:
            p["clients"].remove(websocket)
            
        disc_role = None
        if websocket == p.get("ws_white"):
            disc_role = "white"
            p["ws_white"] = None
        elif websocket == p.get("ws_black"):
            disc_role = "black"
            p["ws_black"] = None
        if disc_role and p["phase"] != "game_over":
            p[f"task_{disc_role}"] = asyncio.create_task(abandon_timer(room_id, disc_role))
