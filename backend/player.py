# Gère le fonctionnement d'un joueur
# Joue les coups

from board import Board
import numpy as np
from scipy.optimize import linear_sum_assignment

PROFONDEUR = 1

# distance :  |   0   |   1   |   2   |   3   |   4+

# tour de 5 : |  55   |  36   |  15   |   10  |   0    
# tour de 4 : |  18   |  12   |   6   |   2   |   0
# tour de 3 : |   6   |   3   |   1   |   0   |   0   
# tour de 2 : |   2   |   1   |   0   |   0   |   0
POINTS_EVALUATION = {
    "T5" : 55,
    "T5_D1" : 36,
    "T5_D2" : 15,
    "T5_D3" : 10,

    "T4" : 18,
    "T4_D1" : 12,
    "T4_D2" : 6,
    "T4_D3" : 2,

    "T3" : 6,
    "T3_D1" : 3,
    "T3_D2" : 1,
    "T3_D3" : 0,

    "T2" : 2,
    "T2_D1" : 1,
    "T2_D2" : 0,
    "T2_D3" : 0,

    "T1" : 0,
}

class Player:
    def __init__(self, color, IA=False):
        self.IA = IA
        self.color = color

        self.is_calculating = False
        self.action = None

    def take_action(self, board):
        board2 = board.copy()
        _, self.action = self.tour_max(board2, -10000, 10000, PROFONDEUR)
        self.is_calculating = False
        
        # 💥 AJOUTE CETTE LIGNE : On doit renvoyer l'action pour le serveur Web !
        return self.action
    

    def tour_max(self, board : Board, alpha, beta, profondeur):
        if profondeur == 0:
            return (self.eval2(board), None)

        all_moves_possible = board.get_all_pawns_move(self.color)
        len50 = 50/len(all_moves_possible)
        u = None
        a = None
        i = -1
        for move in all_moves_possible:
            if profondeur == PROFONDEUR:
                # print(f"move {i} / {len(all_moves_possible)}")
                i+=1
            # vboard = board.copy()
            board.move(move[0], move[1])
            all_stacks_possible = board.get_all_slabs_stack()
            j=0
            for stack in all_stacks_possible:
                if profondeur == PROFONDEUR:
                    percent = round(len50*i + len50 * j / len(all_stacks_possible))
                    bar = "\r|" 
                    for _ in range(percent): bar += "=" 
                    for _ in range(50-percent): bar += " " 
                    print(bar+"|", end='')
                    j += 1
                # vvboard = vboard.copy()
                nb_dalles = board.move(stack[0], stack[1])
                u_min, _ = self.tour_min(board, alpha, beta, profondeur-1)
                board.undo_move(stack[0], stack[1], nb_dalles)
                if u == None or u_min > u:
                    a = (move, stack)
                    u = u_min
                if u >= beta:
                    board.undo_move(move[0], move[1])
                    return (u, a)
                alpha = max(alpha, u)
            board.undo_move(move[0], move[1])
        return (u, a)




    def tour_min(self, board : Board, alpha, beta, profondeur):
        if profondeur == 0:
            return (self.eval2(board)-20, None)

        color = "white" if self.color == "black" else "black"
        all_moves_possible = board.get_all_pawns_move(color)
        u = None
        a = None
        for move in all_moves_possible:
            # vboard = board.copy()
            board.move(move[0], move[1])
            all_stacks_possible = board.get_all_slabs_stack()
            for stack in all_stacks_possible:
                # vvboard = vboard.copy()
                nb_dalles = board.move(stack[0], stack[1])
                u_max, _ = self.tour_max(board, alpha, beta, profondeur-1)
                board.undo_move(stack[0], stack[1], nb_dalles)
                if u == None or u_max < u:
                    a = (move, stack)
                    u = u_max
                if u <= alpha:
                    board.undo_move(move[0], move[1])
                    return (u, a)
                beta = min(beta, u)
            board.undo_move(move[0], move[1])
        return (u, a)

    def eval2(self, board : Board):
        white_points = np.zeros((4, 36))
        black_points = np.zeros((4, 36))

        for y in range(6):
            for x in range(6):
                tower_size = board.dalles[y][x]
                if tower_size <= 1: continue
    
                if (y,x) in board.white_pawns:
                    white_points[board.white_pawns.index((y,x)), y*6+x] = POINTS_EVALUATION[f"T{tower_size}"]
                    continue
                if (y,x) in board.black_pawns:
                    black_points[board.black_pawns.index((y,x)), y*6+x] = POINTS_EVALUATION[f"T{tower_size}"]
                    continue

                for i in range(4):
                    try:
                        white_points[i,y*6+x] = POINTS_EVALUATION[f"T{tower_size}_D{board.A_Star(board.white_pawns[i], (y, x))}"]
                    except:
                        pass
                    try:
                        black_points[i,y*6+x] = POINTS_EVALUATION[f"T{tower_size}_D{board.A_Star(board.black_pawns[i], (y, x))}"]
                    except:
                        pass        

        couts = -white_points
        row_ind, col_ind = linear_sum_assignment(couts)
        valeurs_choisies = white_points[row_ind, col_ind]
        score = sum(valeurs_choisies)
        couts = -black_points
        row_ind, col_ind = linear_sum_assignment(couts)
        valeurs_choisies = black_points[row_ind, col_ind]
        score -= sum(valeurs_choisies)

        white_mobility = [self.CalculMobility(pos, board) for pos in board.white_pawns]
        black_mobility = [self.CalculMobility(pos, board) for pos in board.black_pawns]

        score += sum([np.sqrt(i) for i in white_mobility])
        score -= sum([np.sqrt(i) for i in black_mobility])

        if self.color == "black":
            score = -score
        return score
    
    def CalculMobility(self, pos, board, gamma = 0.5):
        file = [(pos, 0)]
        visites = []
        distances = {}

        while file:
            actual_case, distance = file.pop(0)
            if actual_case[0] not in visites:
                visites.append(actual_case[0])
                
                if distance > 0:
                    distances[distance] = distances.get(distance, 0) + 1

                for voisin in board.get_voisins(pos):
                    file.append((voisin, distance+1))

        score = 0
        for distance, nb_cases in distances.items():
            score += (gamma ** (distance - 1)) * (np.sqrt(nb_cases))
        
        return score

