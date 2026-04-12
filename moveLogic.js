const transpositionTable = new Map();

function boardHash(gameState) {
    return gameState.board.snakes
        .map(s => `${s.id}:${s.body.map(b => `${b.x},${b.y}`).join(';')}:${s.health}`)
        .sort()
        .join('|');
}

function floodFill(pos, gameState, ignoreTail = false) {
    const boardWidth = gameState.board.width;
    const boardHeight = gameState.board.height;

    const blocked = new Set();
    for (const snake of gameState.board.snakes) {
        const segs = ignoreTail ? snake.body.slice(0, -1) : snake.body;
        for (const segment of segs) {
            blocked.add(`${segment.x},${segment.y}`);
        }
    }

    const visited = new Set();
    const queue = [pos];
    visited.add(`${pos.x},${pos.y}`);

    while (queue.length > 0) {
        const current = queue.shift();

        const neighbors = [
            { x: current.x,     y: current.y + 1 },
            { x: current.x,     y: current.y - 1 },
            { x: current.x - 1, y: current.y     },
            { x: current.x + 1, y: current.y     },
        ];

        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;

            if (n.x < 0 || n.x >= boardWidth) continue;
            if (n.y < 0 || n.y >= boardHeight) continue;
            if (blocked.has(key)) continue;
            if (visited.has(key)) continue;

            visited.add(key);
            queue.push(n);
        }
    }

    return visited.size;
}

function voronoiScore(simulatedState, myId) {
    const boardWidth = simulatedState.board.width;
    const boardHeight = simulatedState.board.height;

    const blocked = new Set();
    for (const snake of simulatedState.board.snakes) {
        const segs = snake.body.slice(0, -1);
        for (const segment of segs) {
            blocked.add(`${segment.x},${segment.y}`);
        }
    }

    const owner = {};
    const queue = [];

    for (const snake of simulatedState.board.snakes) {
        const eHead = snake.body[0];
        const eKey = `${eHead.x},${eHead.y}`;
        if (!owner[eKey]) {
            owner[eKey] = { id: snake.id, dist: 0 };
            queue.push({ x: eHead.x, y: eHead.y, id: snake.id, dist: 0 });
        }
    }

    let qi = 0;
    while (qi < queue.length) {
        const current = queue[qi++];

        const neighbors = [
            { x: current.x,     y: current.y + 1 },
            { x: current.x,     y: current.y - 1 },
            { x: current.x - 1, y: current.y     },
            { x: current.x + 1, y: current.y     },
        ];

        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;

            if (n.x < 0 || n.x >= boardWidth) continue;
            if (n.y < 0 || n.y >= boardHeight) continue;
            if (blocked.has(key)) continue;
            if (owner[key]) continue;

            owner[key] = { id: current.id, dist: current.dist + 1 };
            queue.push({
                x: n.x,
                y: n.y,
                id: current.id,
                dist: current.dist + 1
            });
        }
    }

    let mySquares = 0;
    for (const key of Object.keys(owner)) {
        if (owner[key].id === myId) mySquares++;
    }

    return mySquares;
}

function cloneGameState(gameState) {
    return {
        turn: gameState.turn,
        board: {
            width: gameState.board.width,
            height: gameState.board.height,
            food: gameState.board.food.map(f => ({ ...f })),
            snakes: gameState.board.snakes.map(snake => ({
                ...snake,
                body: snake.body.map(seg => ({ ...seg })),
                head: { ...snake.body[0] },
                health: snake.health,
            })),
        },
        you: null,
    };
}

function applyMoves(gameState, moveMap) {
    const next = cloneGameState(gameState);
    const dirDeltas = {
        up:    { x: 0,  y: 1  },
        down:  { x: 0,  y: -1 },
        left:  { x: -1, y: 0  },
        right: { x: 1,  y: 0  },
    };

    for (const snake of next.board.snakes) {
        const dir = moveMap[snake.id] || "up";
        const delta = dirDeltas[dir];
        const newHead = { x: snake.body[0].x + delta.x, y: snake.body[0].y + delta.y };
        snake.body.unshift(newHead);
        snake.head = newHead;
    }

    const foodSet = new Set(next.board.food.map(f => `${f.x},${f.y}`));
    const eatenFood = new Set();

    for (const snake of next.board.snakes) {
        const headKey = `${snake.body[0].x},${snake.body[0].y}`;
        if (foodSet.has(headKey)) {
            snake.health = 100;
            eatenFood.add(headKey);
        } else {
            snake.health = (snake.health || 100) - 1;
            snake.body.pop();
        }
    }

    next.board.food = next.board.food.filter(f => !eatenFood.has(`${f.x},${f.y}`));

    const allHeads = next.board.snakes.map(s => ({
        id: s.id,
        x: s.body[0].x,
        y: s.body[0].y,
        len: s.body.length,
    }));

    next.board.snakes = next.board.snakes.filter(snake => {
        const head = snake.body[0];
        const { width, height } = next.board;

        if (head.x < 0 || head.x >= width || head.y < 0 || head.y >= height) return false;
        if ((snake.health || 100) <= 0) return false;

        const selfHit = snake.body.slice(1).some(
            seg => seg.x === head.x && seg.y === head.y
        );
        if (selfHit) return false;

        const headOnLoss = allHeads.some(
            other => other.id !== snake.id &&
            other.x === head.x &&
            other.y === head.y &&
            other.len >= snake.body.length
        );
        if (headOnLoss) return false;

        return true;
    });

    next.you = next.board.snakes.find(s => s.id === gameState.you.id) || null;
    return next;
}

function getSnakeMoves(snake, gameState) {
    const { width, height } = gameState.board;
    const dirs = ["up", "down", "left", "right"];
    const deltas = {
        up:    { x: 0,  y: 1  },
        down:  { x: 0,  y: -1 },
        left:  { x: -1, y: 0  },
        right: { x: 1,  y: 0  },
    };
    const head = snake.body[0];
    const neck = snake.body[1];

    return dirs.filter(dir => {
        const d = deltas[dir];
        const nx = head.x + d.x;
        const ny = head.y + d.y;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) return false;
        if (neck && nx === neck.x && ny === neck.y) return false;
        return true;
    });
}

function predictEnemyMove(enemy, gameState) {
    const moves = getSnakeMoves(enemy, gameState);
    if (moves.length === 0) return "down";

    const deltas = {
        up:    { x: 0,  y: 1  },
        down:  { x: 0,  y: -1 },
        left:  { x: -1, y: 0  },
        right: { x: 1,  y: 0  },
    };

    let bestMove = moves[0];
    let bestSpace = -1;

    for (const dir of moves) {
        const d = deltas[dir];
        const pos = { x: enemy.body[0].x + d.x, y: enemy.body[0].y + d.y };
        const space = floodFill(pos, gameState, true);
        if (space > bestSpace) {
            bestSpace = space;
            bestMove = dir;
        }
    }

    return bestMove;
}

function aStar(start, goal, gameState) {
    const boardWidth = gameState.board.width;
    const boardHeight = gameState.board.height;

    const blocked = new Set();
    for (const snake of gameState.board.snakes) {
        const segs = snake.body.slice(0, -1);
        for (const segment of segs) {
            blocked.add(`${segment.x},${segment.y}`);
        }
    }

    const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

    const openSet = [{ x: start.x, y: start.y, g: 0, f: heuristic(start, goal) }];
    const gScore = {};
    gScore[`${start.x},${start.y}`] = 0;

    while (openSet.length > 0) {
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift();

        if (current.x === goal.x && current.y === goal.y) {
            return current.g;
        }

        const neighbors = [
            { x: current.x,     y: current.y + 1 },
            { x: current.x,     y: current.y - 1 },
            { x: current.x - 1, y: current.y     },
            { x: current.x + 1, y: current.y     },
        ];

        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (n.x < 0 || n.x >= boardWidth) continue;
            if (n.y < 0 || n.y >= boardHeight) continue;
            if (blocked.has(key)) continue;

            const tentativeG = current.g + 1;
            if (gScore[key] === undefined || tentativeG < gScore[key]) {
                gScore[key] = tentativeG;
                openSet.push({ x: n.x, y: n.y, g: tentativeG, f: tentativeG + heuristic(n, goal) });
            }
        }
    }

    return Infinity;
}

function getWeights(gameState, me) {
    const snakeCount = gameState.board.snakes.length;
    const isLowHealth = me.health < 40;
    const turn = gameState.turn;

    if (snakeCount === 2) {
        return { space: 3, territory: 4, length: 3, food: isLowHealth ? 4 : 0.5 };
    }
    if (turn < 50) {
        return { space: 2, territory: 2, length: 4, food: isLowHealth ? 5 : 2 };
    }
    return { space: 3, territory: 3, length: 2, food: isLowHealth ? 5 : 1 };
}

function evaluate(gameState, myId) {
    const me = gameState.board.snakes.find(s => s.id === myId);
    if (!me) return -10000;
    if (gameState.board.snakes.length === 1) return 10000;

    const myHead = me.body[0];
    const space = floodFill(myHead, gameState, true);
    const territory = voronoiScore(gameState, myId);
    const w = getWeights(gameState, me);

    const healthPenalty = me.health < 30
        ? (30 - me.health) * 5
        : me.health < 50
        ? (50 - me.health) * 1
        : 0;

    let foodBonus = 0;
    if (me.health < 50 && gameState.board.food.length > 0) {
        const nearestFoodDist = Math.min(...gameState.board.food.map(f =>
            Math.abs(f.x - myHead.x) + Math.abs(f.y - myHead.y)
        ));
        foodBonus = (50 - nearestFoodDist) * w.food;
    }

    let endgameBonus = 0;
    if (gameState.board.snakes.length === 2) {
        const enemy = gameState.board.snakes.find(s => s.id !== myId);
        if (enemy && me.body.length > enemy.body.length + 3) {
            const myTail = me.body[me.body.length - 1];
            const tailDist = aStar(myHead, myTail, gameState);
            endgameBonus = Math.max(0, 20 - tailDist) * 2;
        }
    }

    return (space * w.space) + (territory * w.territory) + (me.body.length * w.length) - healthPenalty + foodBonus + endgameBonus;
}

function minimax(gameState, depth, alpha, beta, myId, startTime, timeLimitMs) {
    if (Date.now() - startTime >= timeLimitMs) return evaluate(gameState, myId);

    const hash = boardHash(gameState);
    if (transpositionTable.has(hash)) return transpositionTable.get(hash);

    const me = gameState.board.snakes.find(s => s.id === myId);

    if (depth === 0 || !me || gameState.board.snakes.length === 0) {
        const score = evaluate(gameState, myId);
        transpositionTable.set(hash, score);
        return score;
    }

    const enemies = gameState.board.snakes.filter(s => s.id !== myId);
    const myMoves = getSnakeMoves(me, gameState);

    if (myMoves.length === 0) return -10000;

    let bestScore = -Infinity;

    for (const myMove of myMoves) {
        if (Date.now() - startTime >= timeLimitMs) break;

        const enemyMoveCombos = [{}];

        for (const enemy of enemies) {
            const myHeadNext = {
                x: me.body[0].x + (myMove === 'right' ? 1 : myMove === 'left' ? -1 : 0),
                y: me.body[0].y + (myMove === 'up' ? 1 : myMove === 'down' ? -1 : 0),
            };
            const enemyHead = enemy.body[0];
            const distToMe = Math.abs(enemyHead.x - myHeadNext.x) + Math.abs(enemyHead.y - myHeadNext.y);
            const isClose = distToMe <= 2;

            if (isClose) {
                const eMoves = getSnakeMoves(enemy, gameState);
                const validEnemyMoves = eMoves.length > 0 ? eMoves : ["down"];
                const newCombos = [];
                for (const combo of enemyMoveCombos) {
                    for (const em of validEnemyMoves) {
                        newCombos.push({ ...combo, [enemy.id]: em });
                    }
                }
                enemyMoveCombos.length = 0;
                enemyMoveCombos.push(...newCombos);
            } else {
                const predicted = predictEnemyMove(enemy, gameState);
                for (const combo of enemyMoveCombos) {
                    combo[enemy.id] = predicted;
                }
            }
        }

        let worstScore = Infinity;

        for (const enemyCombo of enemyMoveCombos) {
            const moveMap = { [myId]: myMove, ...enemyCombo };
            const nextState = applyMoves(gameState, moveMap);
            const score = minimax(nextState, depth - 1, alpha, beta, myId, startTime, timeLimitMs);
            if (score < worstScore) worstScore = score;
            if (worstScore < beta) beta = worstScore;
            if (alpha >= beta) break;
        }

        if (worstScore > bestScore) bestScore = worstScore;
        if (bestScore > alpha) alpha = bestScore;
        if (alpha >= beta) break;
    }

    transpositionTable.set(hash, bestScore);
    return bestScore;
}

function iterativeDeepeningMinimax(gameState, myId, validMoves, possibleMoves, timeLimitMs) {
    const startTime = Date.now();
    const deltas = {
        up:    { x: 0,  y: 1  },
        down:  { x: 0,  y: -1 },
        left:  { x: -1, y: 0  },
        right: { x: 1,  y: 0  },
    };

    let bestMove = validMoves[0];
    let depth = 1;

    while (Date.now() - startTime < timeLimitMs && depth <= 10) {
        let bestScoreThisDepth = -Infinity;
        let bestMoveThisDepth = validMoves[0];

        for (const dir of validMoves) {
            if (Date.now() - startTime >= timeLimitMs) break;

            const enemies = gameState.board.snakes.filter(s => s.id !== myId);
            const enemyMoveCombos = [{}];

            for (const enemy of enemies) {
                const d = deltas[dir];
                const myHeadNext = {
                    x: gameState.you.body[0].x + d.x,
                    y: gameState.you.body[0].y + d.y,
                };
                const enemyHead = enemy.body[0];
                const distToMe = Math.abs(enemyHead.x - myHeadNext.x) + Math.abs(enemyHead.y - myHeadNext.y);
                const isClose = distToMe <= 2;

                if (isClose) {
                    const eMoves = getSnakeMoves(enemy, gameState);
                    const validEnemyMoves = eMoves.length > 0 ? eMoves : ["down"];
                    const newCombos = [];
                    for (const combo of enemyMoveCombos) {
                        for (const em of validEnemyMoves) {
                            newCombos.push({ ...combo, [enemy.id]: em });
                        }
                    }
                    enemyMoveCombos.length = 0;
                    enemyMoveCombos.push(...newCombos);
                } else {
                    const predicted = predictEnemyMove(enemy, gameState);
                    for (const combo of enemyMoveCombos) {
                        combo[enemy.id] = predicted;
                    }
                }
            }

            let worstScore = Infinity;

            for (const enemyCombo of enemyMoveCombos) {
                const moveMap = { [myId]: dir, ...enemyCombo };
                const nextState = applyMoves(gameState, moveMap);
                const score = minimax(nextState, depth - 1, -Infinity, Infinity, myId, startTime, timeLimitMs);
                if (score < worstScore) worstScore = score;
            }

            const pos = possibleMoves[dir];
            const centerX = (gameState.board.width - 1) / 2;
            const centerY = (gameState.board.height - 1) / 2;
            const centerDist = Math.abs(pos.x - centerX) + Math.abs(pos.y - centerY);
            const finalScore = worstScore + (-centerDist * 0.5);

            if (finalScore > bestScoreThisDepth) {
                bestScoreThisDepth = finalScore;
                bestMoveThisDepth = dir;
            }
        }

        bestMove = bestMoveThisDepth;
        depth++;
    }

    return bestMove;
}

export default function move(gameState) {
    transpositionTable.clear();

    const head = gameState.you.body[0];
    const neck = gameState.you.body[1];
    const boardWidth = gameState.board.width;
    const boardHeight = gameState.board.height;

    const possibleMoves = {
        up:    { x: head.x, y: head.y + 1 },
        down:  { x: head.x, y: head.y - 1 },
        left:  { x: head.x - 1, y: head.y },
        right: { x: head.x + 1, y: head.y },
    };

    let directionSafety = { up: true, down: true, left: true, right: true };

    if (neck.x < head.x) directionSafety.left = false;
    else if (neck.x > head.x) directionSafety.right = false;
    else if (neck.y < head.y) directionSafety.down = false;
    else if (neck.y > head.y) directionSafety.up = false;

    if (head.x === 0)               directionSafety.left = false;
    if (head.x === boardWidth - 1)  directionSafety.right = false;
    if (head.y === 0)               directionSafety.down = false;
    if (head.y === boardHeight - 1) directionSafety.up = false;

    const allBodySegments = new Set();
    for (const snake of gameState.board.snakes) {
        for (const seg of snake.body.slice(0, -1)) {
            allBodySegments.add(`${seg.x},${seg.y}`);
        }
    }
    for (const [dir, pos] of Object.entries(possibleMoves)) {
        if (!directionSafety[dir]) continue;
        if (allBodySegments.has(`${pos.x},${pos.y}`)) {
            directionSafety[dir] = false;
        }
    }

    const snakeSize = gameState.you.body.length;
    for (const snake of gameState.board.snakes) {
        if (snake.id === gameState.you.id) continue;
        if (snake.body.length < snakeSize) continue;

        const enemyHead = snake.body[0];
        const enemyMoves = [
            { x: enemyHead.x,     y: enemyHead.y + 1 },
            { x: enemyHead.x,     y: enemyHead.y - 1 },
            { x: enemyHead.x - 1, y: enemyHead.y     },
            { x: enemyHead.x + 1, y: enemyHead.y     },
        ];

        for (const [dir, pos] of Object.entries(possibleMoves)) {
            if (!directionSafety[dir]) continue;
            const dangerousSquare = enemyMoves.some(e => e.x === pos.x && e.y === pos.y);
            if (dangerousSquare) directionSafety[dir] = false;
        }
    }

    const health = gameState.you.health;
    const nearMatchEnemy = gameState.board.snakes.some(
        s => s.id !== gameState.you.id && s.body.length >= snakeSize - 2
    );
    const needsFood = health < 30 || nearMatchEnemy;

    const smallerSnakes = gameState.board.snakes.filter(
        snake => snake.id !== gameState.you.id && snake.body.length < snakeSize
    );

    const food = gameState.board.food;
    const targetPos = smallerSnakes.length > 0 && !needsFood
        ? smallerSnakes.reduce((best, snake) => {
              const dist = aStar(head, snake.body[0], gameState);
              return dist < best.dist ? { pos: snake.body[0], dist } : best;
          }, { pos: null, dist: Infinity }).pos
        : needsFood && food.length > 0
        ? food.reduce((best, f) => {
              const dist = aStar(head, f, gameState);
              return dist < best.dist ? { pos: f, dist } : best;
          }, { pos: null, dist: Infinity }).pos
        : null;

    let validMoves = Object.keys(directionSafety).filter(d => directionSafety[d]);

    if (validMoves.length === 0) {
        const fallback = Object.entries(possibleMoves)
            .filter(([, pos]) =>
                pos.x >= 0 && pos.x < boardWidth &&
                pos.y >= 0 && pos.y < boardHeight
            )
            .map(([dir, pos]) => ({ dir, space: floodFill(pos, gameState, true) }))
            .sort((a, b) => b.space - a.space)[0];

        return { move: fallback ? fallback.dir : "up" };
    }

    if (targetPos) {
        validMoves.sort((a, b) => {
            const pa = possibleMoves[a];
            const pb = possibleMoves[b];
            return aStar(pa, targetPos, gameState) - aStar(pb, targetPos, gameState);
        });
    }

    const nextMove = iterativeDeepeningMinimax(
        gameState,
        gameState.you.id,
        validMoves,
        possibleMoves,
        400
    );

    console.log(`MOVE ${gameState.turn}: ${nextMove}`);
    return { move: nextMove };
}


    //the fomer todoes
    // We've included code to prevent your Battlesnake from moving backwards
    // TODO: Step 1 - Prevent your Battlesnake from moving out of bounds
    // gameState.board contains an object representing the game board including its width and height
    // https://docs.battlesnake.com/api/objects/board
    // TODO: Step 2 - Prevent your Battlesnake from colliding with itself
    // gameState.you contains an object representing your snake, including its coordinates
    // https://docs.battlesnake.com/api/objects/battlesnake
    // TODO: Step 3 - Prevent your Battlesnake from colliding with other Battlesnakes
    // gameState.board.snakes contains an array of enemy snake objects, which includes their coordinates
    // https://docs.battlesnake.com/api/objects/battlesnake
    //Object.keys(moveSafety) returns ["up", "down", "left", "right"]
    //.filter() filters the array based on the function provided as an argument (using arrow function syntax here)
    //In this case we want to filter out any of these directions for which moveSafety[direction] == false
    // TODO: Step 4 - Move towards food instead of random, to regain health and survive longer
    // gameState.board.food contains an array of food coordinates https://docs.battlesnake.com/api/objects/board 
// it uses a multi layer decision system 1 it filters out unsafe moves like collisions and dangerous head to head scenario 2 it sees each remaining move using three strategies the flood fill to measure available space the a Voronoi algorithm to estimate territory control against other snake and distance to a target, which is either food or weaker enemies 

//source https://youtu.be/Bxdt6T_1qgc?si=IiSDRa5G9pYBIl7d
// and https://docs.battlesnake.com/guides/useful-algorithms
//so it uses uses minimax with optimizations to choose the best move each turn. 
// and It simulates future game states, 
// evaluates them, and picks the safest or most strategic option.
// the biggest issus was learing how to implement the minimax algorithm  since i had an idea of how it works since i wanted to make a simlier game for mysleft but never got to it