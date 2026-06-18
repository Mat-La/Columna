class Board:
    def __init__(self, screen=None):
        self.screen = screen
        self.dalles = []
        self.white_pawns = []
        self.black_pawns = []

        for i in range(6):
            self.dalles.append([])
            for j in range(6):
                self.dalles[i].append(1)

        self.white_pawns = [(2, 0), (2, 3), (0, 5), (5, 4)]
        self.black_pawns = [(0, 1), (3, 2), (3, 5), (5, 0)]
        
        if self.screen:
            self.board_image = pygame.image.load("img/board.jpg")
            self.dalle_images = [
                pygame.image.load(f"img/dalle{i}.jpg") for i in range(1, 6)
            ]
            self.black_pawns_image = pygame.image.load("img/pion_noir.png")
            self.white_pawns_image = pygame.image.load("img/pion_blanc.png")

    def display(self):
        self.screen.blit(self.board_image, (0, 0))
        for y in range(len(self.dalles)):
            for x in range(len(self.dalles[y])):
                if self.dalles[y][x] == 0: continue
                self.screen.blit(
                    self.dalle_images[self.dalles[y][x]-1], (20 + 100 * x, 20 + 100 * y)
                )
        for i in self.white_pawns:
            self.screen.blit(self.white_pawns_image, (35+100*i[1], 35+100*i[0]))
        for i in self.black_pawns:
            self.screen.blit(self.black_pawns_image, (35+100*i[1], 35+100*i[0]))

    def available_mouv(self, begin, end, color_turn):
        if self.dalles[end[0]][end[1]] == 0: return False
        if end in self.white_pawns or end in self.black_pawns: return False
        if begin not in self.white_pawns and begin not in self.black_pawns and self.dalles[begin[0]][begin[1]] + self.dalles[end[0]][end[1]] > 5: return False


        if end[0] == begin[0]:
            # mouvement vers la droite
            if begin[1] < end[1]:
                for i in range(begin[1]+1, end[1]):
                    if self.dalles[begin[0]][i] != 0:
                        return False
                return True
            # mouvement vers la gauche
            if begin[1] > end[1]:
                for i in range(begin[1]-1, end[1], -1):
                    if self.dalles[begin[0]][i] != 0:
                        return False
                return True
        
        if end[1] == begin[1]:
            # mouvement vers le bas
            if begin[0] < end[0]:
                for i in range(begin[0]+1, end[0]):
                    if self.dalles[i][begin[1]] != 0:
                        return False
                return True
            # mouvement vers le haut
            if begin[0] > end[0]:
                for i in range(begin[0]-1, end[0], -1):
                    if self.dalles[i][begin[1]] != 0:
                        return False
                return True

        return False
        

    # une fonction qui déplace un pion ou une pile
    def move(self, begin, end):
        if begin in self.white_pawns:
            self.white_pawns.remove(begin)
            self.white_pawns.append(end)
        elif begin in self.black_pawns:
            self.black_pawns.remove(begin)
            self.black_pawns.append(end)
        else:
            nb_dalles = self.dalles[begin[0]][begin[1]]
            self.dalles[end[0]][end[1]] += nb_dalles
            self.dalles[begin[0]][begin[1]] = 0
            return nb_dalles
        
    def undo_move(self, begin, end, nb_dalles = None):
        if not nb_dalles:
            self.move(end, begin)
        else:
            self.dalles[end[0]][end[1]] -= nb_dalles
            self.dalles[begin[0]][begin[1]] = nb_dalles

    def get_all_pawns_move(self, color):
        all_moves = []
        for coords in (self.white_pawns if color == "white" else self.black_pawns):
            for e in self.get_one_pawn_move(color, coords):
                all_moves.append(e)
        return all_moves
    
    def get_one_pawn_move(self, color, coords:tuple):
        """renvoie tous les mouvements possibles pour un pion (= une position)"""
        all_move_one_pawn = []
        
        # deplacement a droite
        for i in range(coords[1]+1, 6):
            if self.dalles[coords[0]][i] != 0:
                if (coords[0], i) not in self.white_pawns and (coords[0], i) not in self.black_pawns:
                    all_move_one_pawn.append((coords, (coords[0], i)))
                break
        # deplacement a gauche
        for i in range(coords[1]-1, -1, -1):
            if self.dalles[coords[0]][i] != 0:
                if (coords[0], i) not in self.white_pawns and (coords[0], i) not in self.black_pawns:
                    all_move_one_pawn.append((coords, (coords[0], i)))
                break
        # deplacement en bas
        for i in range(coords[0]+1, 6):
            if self.dalles[i][coords[1]] != 0:
                if (i, coords[1]) not in self.white_pawns and (i, coords[1]) not in self.black_pawns:
                    all_move_one_pawn.append((coords, (i, coords[1])))
                break
        # deplacement en haut
        for i in range(coords[0]-1, -1, -1):
            if self.dalles[i][coords[1]] != 0:
                if (i, coords[1]) not in self.white_pawns and (i, coords[1]) not in self.black_pawns:
                    all_move_one_pawn.append((coords, (i, coords[1])))
                break
                
        return all_move_one_pawn
   
    def get_all_slabs_stack(self):
        all_moves = []
        for y in range(6):
            for x in range(6):
                if self.dalles[y][x] == 0 or (y, x) in self.white_pawns or (y,x) in self.black_pawns: continue
                if self.dalles[y][x] == 0 or (y, x) in self.white_pawns or (y,x) in self.black_pawns: continue
                nb_dalles = self.dalles[y][x]
                # deplacement a doite
                for i in range(x+1, 6):
                    if self.dalles[y][i] != 0:
                        if (y, i) not in self.white_pawns and (y, i) not in self.black_pawns and nb_dalles + self.dalles[y][i] <= 5:
                            all_moves.append(((y, x), (y, i)))
                        break
                # deplacement a gauche
                for i in range(x-1, -1, -1):
                    if self.dalles[y][i] != 0:
                        if (y, i) not in self.white_pawns and (y, i) not in self.black_pawns and nb_dalles + self.dalles[y][i] <= 5:
                            all_moves.append(((y, x), (y, i)))
                        break
                # deplacement en bas
                for i in range(y+1, 6):
                    if self.dalles[i][x] != 0:
                        if (i, x) not in self.white_pawns and (i, x) not in self.black_pawns and nb_dalles + self.dalles[i][x] <= 5:
                            all_moves.append(((y, x), (i, x)))
                        break
                # deplacement en haut
                for i in range(y-1, -1, -1):
                    if self.dalles[i][x] != 0:
                        if (i, x) not in self.white_pawns and (i, x) not in self.black_pawns and nb_dalles + self.dalles[i][x] <= 5:
                            all_moves.append(((y, x), (i, x)))
                        break
        return all_moves

    def get_result(self):
        current_white_stack = 0 
        current_black_stack = 0

        for i in range(5,2, -1):
            for white_position in self.white_pawns:
                if self.dalles[white_position[0]][white_position[1]] == i: 
                    current_white_stack += 1 
            for black_position in self.black_pawns:
                if self.dalles[black_position[0]][black_position[1]] == i: 
                    current_black_stack += 1

            if current_white_stack == current_black_stack: 
                current_white_stack = 0 
                current_black_stack = 0
                continue
            elif current_black_stack > current_white_stack : 
                return "black"
            
            return "white"
        
        return "draw"
        
    def copy(self):
        board = Board(None)
        board.dalles = []
        for l in self.dalles:
            board.dalles.append(l.copy())
        board.white_pawns = self.white_pawns.copy()
        board.black_pawns = self.black_pawns.copy()
        return board
    
    def get_voisins(self, pos):
        """Renvoie les cases atteignables depuis pos en un coup"""
        voisins = []
        y, x = pos
        all_pawns = self.white_pawns + self.black_pawns

        # Droite
        for i in range(x + 1, 6):
            if self.dalles[y][i] != 0:
                if (y, i) not in all_pawns:
                    voisins.append((y, i))
                break  
        # Gauche
        for i in range(x - 1, -1, -1):
            if self.dalles[y][i] != 0:
                if (y, i) not in all_pawns:
                    voisins.append((y, i))
                break
        # Bas
        for i in range(y + 1, 6):
            if self.dalles[i][x] != 0:
                if (i, x) not in all_pawns:
                    voisins.append((i, x))
                break
        # Haut
        for i in range(y - 1, -1, -1):
            if self.dalles[i][x] != 0:
                if (i, x) not in all_pawns:
                    voisins.append((i, x))
                break

        return voisins
    
    def heuristique(self, pos, goal):
        if pos[0] == goal[0] or pos[1] == goal[1]:
            return 1
        return 2

    def A_Star(self, start: tuple, goal: tuple):
        
        if goal in (self.white_pawns + self.black_pawns) or self.dalles[goal[0]][goal[1]] == 0:
            return -1

        open_list = [(self.heuristique(start, goal), 0, start, [start])]
        closed_list = set()
        
        while open_list:
            open_list.sort(key=lambda n: n[0])
            f, g, current, path = open_list.pop(0)
            
            if current == goal:
                return len(path) - 1
            
            if current in closed_list:
                continue
            closed_list.add(current)
            
            for voisin in self.get_voisins(current):
                if voisin in closed_list:
                    continue
                nouveau_g = g + 1
                nouveau_f = nouveau_g + self.heuristique(voisin, goal)
                open_list.append((nouveau_f, nouveau_g, voisin, path + [voisin]))
        
        return -1
