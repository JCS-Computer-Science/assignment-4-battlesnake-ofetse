function neighbors({ x, y }) {
    return [
        { x, y: y + 1 },
        { x, y: y - 1 },
        { x: x - 1, y },
        { x: x + 1, y },
    ];
}

function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function applyDirection(pos, dir) {
    if (dir === "up")    return { x: pos.x,     y: pos.y + 1 };
    if (dir === "down")  return { x: pos.x,     y: pos.y - 1 };
    if (dir === "left")  return { x: pos.x - 1, y: pos.y     };
    if (dir === "right") return { x: pos.x + 1, y: pos.y     };
}

function cloneState(state) {
    const cloned = {
        turn: state.turn,
        board: {
            width:  state.board.width,
            height: state.board.height,
            food:   state.board.food.map(f => ({ x: f.x, y: f.y })),
            snakes: state.board.snakes.map(s => ({
                id:     s.id,
                health: s.health,
                body:   s.body.map(b => ({ x: b.x, y: b.y })),
            })),
        },
        you: null,
    };
    cloned.you = cloned.board.snakes.find(s => s.id === state.you.id) || null;
    return cloned;
}

function buildBlocked(state) {
    const blocked = new Set();
    for (const snake of state.board.snakes) {
        const body = snake.body;
        for (let i = 0; i < body.length; i++) {
            if (i === body.length - 1) {
                const justAte = body.length >= 2 &&
                    body[body.length - 1].x === body[body.length - 2].x &&
                    body[body.length - 1].y === body[body.length - 2].y;
                if (!justAte) continue;
            }
            blocked.add(`${body[i].x},${body[i].y}`);
        }
    }
    return blocked;
}

function inBounds(pos, state) {
    return pos.x >= 0 && pos.x < state.board.width &&
           pos.y >= 0 && pos.y < state.board.height;
}

function legalMoves(snake, state) {
    const blocked = buildBlocked(state);
    const neck = snake.body[1] || snake.body[0];
    const head = snake.body[0];
    const dirs = [];

    for (const dir of ["up", "down", "left", "right"]) {
        const next = applyDirection(head, dir);
        if (next.x === neck.x && next.y === neck.y) continue;
        if (!inBounds(next, state)) continue;
        if (blocked.has(`${next.x},${next.y}`)) continue;
        dirs.push(dir);
    }

    return dirs.length > 0 ? dirs : ["down"];
}

function simulateFullTurn(state, myMove, enemyMoves) {
    const next = cloneState(state);
    const moveMap = { [state.you.id]: myMove, ...enemyMoves };

    for (const snake of next.board.snakes) {
        const dir = moveMap[snake.id];
        if (!dir) continue;
        const newHead = applyDirection(snake.body[0], dir);
        snake.body.unshift(newHead);
        snake.health -= 1;

        const fi = next.board.food.findIndex(f => f.x === newHead.x && f.y === newHead.y);
        if (fi >= 0) {
            snake.health = 100;
            next.board.food.splice(fi, 1);
        } else {
            snake.body.pop();
        }
    }

    const headCount = {};
    for (const snake of next.board.snakes) {
        const key = `${snake.body[0].x},${snake.body[0].y}`;
        if (!headCount[key]) headCount[key] = [];
        headCount[key].push(snake);
    }

    const bodySet = new Set();
    for (const snake of next.board.snakes) {
        for (let i = 1; i < snake.body.length; i++) {
            bodySet.add(`${snake.body[i].x},${snake.body[i].y}`);
        }
    }

    next.board.snakes = next.board.snakes.filter(snake => {
        const head = snake.body[0];
        if (snake.health <= 0) return false;
        if (!inBounds(head, next)) return false;
        if (bodySet.has(`${head.x},${head.y}`)) return false;
        const clashGroup = headCount[`${head.x},${head.y}`];
        if (clashGroup && clashGroup.length > 1) {
            const maxLen = Math.max(...clashGroup.map(s => s.body.length));
            if (snake.body.length < maxLen) return false;
            if (clashGroup.filter(s => s.body.length === maxLen).length > 1) return false;
        }
        return true;
    });

    next.you = next.board.snakes.find(s => s.id === state.you.id) || null;
    return next;
}

function floodFill(pos, state, extraBlocked = new Set()) {
    const { width, height } = state.board;
    const blocked = buildBlocked(state);
    for (const k of extraBlocked) blocked.add(k);

    const visited = new Set();
    const queue = [pos];
    visited.add(`${pos.x},${pos.y}`);

    while (queue.length > 0) {
        const cur = queue.shift();
        for (const n of neighbors(cur)) {
            const key = `${n.x},${n.y}`;
            if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
            if (blocked.has(key) || visited.has(key)) continue;
            visited.add(key);
            queue.push(n);
        }
    }
    return visited.size;
}

function voronoiScore(myStart, state) {
    const { width, height } = state.board;
    const blocked = buildBlocked(state);
    const owner = {};
    const queue = [];

    const seed = (pos, id, dist) => {
        const key = `${pos.x},${pos.y}`;
        if (!owner[key]) {
            owner[key] = { id, dist };
            queue.push({ x: pos.x, y: pos.y, id, dist });
        }
    };

    seed(myStart, state.you.id, 0);
    for (const snake of state.board.snakes) {
        if (snake.id !== state.you.id) seed(snake.body[0], snake.id, 0);
    }

    let qi = 0;
    while (qi < queue.length) {
        const cur = queue[qi++];
        for (const n of neighbors(cur)) {
            const key = `${n.x},${n.y}`;
            if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
            if (blocked.has(key)) continue;
            if (owner[key]) {
                if (owner[key].dist === cur.dist + 1 && owner[key].id !== cur.id) {
                    owner[key].id = null;
                }
                continue;
            }
            owner[key] = { id: cur.id, dist: cur.dist + 1 };
            queue.push({ x: n.x, y: n.y, id: cur.id, dist: cur.dist + 1 });
        }
    }

    return Object.values(owner).filter(o => o.id === state.you.id).length;
}

function escapeRoutes(pos, state) {
    const { width, height } = state.board;
    const blocked = buildBlocked(state);
    return neighbors(pos).filter(n => {
        if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) return false;
        return !blocked.has(`${n.x},${n.y}`);
    }).length;
}

function isTunnel(pos, state) {
    const space = floodFill(pos, state);
    const myLen = state.you ? state.you.body.length : 3;
    return space < myLen * 1.5 && escapeRoutes(pos, state) <= 2;
}

function enemyDangerZones(state) {
    const { width, height } = state.board;
    const blocked = buildBlocked(state);
    const myLen = state.you ? state.you.body.length : 0;
    const danger = new Set();

    for (const snake of state.board.snakes) {
        if (state.you && snake.id === state.you.id) continue;
        for (const n of neighbors(snake.body[0])) {
            if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
            if (blocked.has(`${n.x},${n.y}`)) continue;
            if (snake.body.length >= myLen) danger.add(`${n.x},${n.y}`);
        }
    }
    return danger;
}

function predictEnemyMove(snake, state) {
    const moves = legalMoves(snake, state);
    if (moves.length === 0) return "down";

    if (snake.health < 40 && state.board.food.length > 0) {
        const head = snake.body[0];
        const nearestFood = state.board.food.reduce((best, f) => {
            const d = manhattan(head, f);
            return d < best.dist ? { pos: f, dist: d } : best;
        }, { pos: null, dist: Infinity }).pos;

        if (nearestFood) {
            const foodDir = moves.find(dir => {
                const n = applyDirection(head, dir);
                return manhattan(n, nearestFood) < manhattan(head, nearestFood);
            });
            if (foodDir) return foodDir;
        }
    }

    let best = null;
    let bestSpace = -1;
    for (const dir of moves) {
        const pos = applyDirection(snake.body[0], dir);
        const space = floodFill(pos, state);
        if (space > bestSpace) {
            bestSpace = space;
            best = dir;
        }
    }
    return best || moves[0];
}

function buildEnemyMoveMap(state) {
    const map = {};
    for (const snake of state.board.snakes) {
        if (state.you && snake.id === state.you.id) continue;
        map[snake.id] = predictEnemyMove(snake, state);
    }
    return map;
}

function evaluate(state) {
    if (!state.you) return -100000;

    const head = state.you.body[0];
    const myLen = state.you.body.length;
    const myHealth = state.you.health;
    const { width, height } = state.board;

    const space = floodFill(head, state);
    if (space < myLen * 0.5) return -50000 + space;

    const territory = voronoiScore(head, state);
    const escapes   = escapeRoutes(head, state);
    const tunnel    = isTunnel(head, state) ? -40 : 0;
    const healthScore = myHealth < 50 ? (myHealth - 50) * 1.5 : 0;
    const lengthBonus = myLen * 2;
    const edgePenalty = (head.x === 0 || head.x === width - 1 ||
                         head.y === 0 || head.y === height - 1) ? -5 : 0;

    let killBonus = 0;
    for (const snake of state.board.snakes) {
        if (state.you && snake.id === state.you.id) continue;
        if (snake.body.length < myLen) {
            const dist = manhattan(head, snake.body[0]);
            killBonus += Math.max(0, 10 - dist) * 3;
        }
    }

    return (space * 2) + (territory * 3) + (escapes * 5) +
           tunnel + healthScore + killBonus + edgePenalty + lengthBonus;
}

function minimax(state, depth, alpha, beta, isMyTurn, startTime, timeLimit) {
    if (Date.now() - startTime > timeLimit) return evaluate(state);
    if (!state.you) return -100000;
    if (depth === 0) return evaluate(state);

    if (isMyTurn) {
        const myMoves = legalMoves(state.you, state);
        if (myMoves.length === 0) return -100000;

        let best = -Infinity;
        for (const myMove of myMoves) {
            const enemyMoves = buildEnemyMoveMap(state);
            const nextState = simulateFullTurn(state, myMove, enemyMoves);
            const score = minimax(nextState, depth - 1, alpha, beta, false, startTime, timeLimit);
            best = Math.max(best, score);
            alpha = Math.max(alpha, best);
            if (beta <= alpha) break;
        }
        return best;
    } else {
        return minimax(state, depth - 1, alpha, beta, true, startTime, timeLimit);
    }
}

function minimaxRoot(state, validMoves, timeLimit) {
    const startTime = Date.now();
    let bestMove = validMoves[0];

    for (let depth = 1; depth <= 6; depth++) {
        if (Date.now() - startTime > timeLimit * 0.85) break;

        let depthBest = -Infinity;
        let depthBestMove = validMoves[0];

        for (const dir of validMoves) {
            const enemyMoves = buildEnemyMoveMap(state);
            const nextState = simulateFullTurn(state, dir, enemyMoves);
            const score = minimax(
                nextState, depth - 1,
                -Infinity, Infinity,
                false, startTime, timeLimit
            );

            if (score > depthBest) {
                depthBest = score;
                depthBestMove = dir;
            }
        }

        if (Date.now() - startTime < timeLimit * 0.9) {
            bestMove = depthBestMove;
        }

        console.log(`  Depth ${depth}: best=${depthBestMove} score=${depthBest} elapsed=${Date.now()-startTime}ms`);
    }

    return bestMove;
}

function chooseFoodTarget(state) {
    const head = state.you.body[0];
    const myHealth = state.you.health;
    const myLen = state.you.body.length;

    if (state.board.food.length === 0) return null;

    let bestFood = null;
    let bestScore = -Infinity;

    for (const food of state.board.food) {
        const dist = manhattan(head, food);
        const willStarve = myHealth <= dist + 2;
        const enemyCloser = state.board.snakes.some(s => {
            if (s.id === state.you.id) return false;
            return manhattan(s.body[0], food) < dist;
        });
        const spaceNearFood = floodFill(food, state);
        const foodIsTrapped = spaceNearFood < myLen * 1.2;

        let foodScore = -dist * 2;
        if (willStarve)    foodScore += 100;
        if (enemyCloser)   foodScore -= 20;
        if (foodIsTrapped) foodScore -= 40;
        if (myHealth < 30) foodScore += 30;
        if (myHealth < 50) foodScore += 15;

        if (foodScore > bestScore) {
            bestScore = foodScore;
            bestFood = food;
        }
    }

    if (myHealth >= 70 && bestFood) {
        const spaceNearFood = floodFill(bestFood, state);
        if (spaceNearFood < myLen * 1.2) return null;
    }

    return bestFood;
}

function trapScore(pos, state) {
    const myLen = state.you.body.length;
    let score = 0;
    for (const snake of state.board.snakes) {
        if (snake.id === state.you.id) continue;
        if (snake.body.length >= myLen) continue;
        const eHead = snake.body[0];
        const eDist = manhattan(pos, eHead);
        const enemySpace = floodFill(eHead, state, new Set([`${pos.x},${pos.y}`]));
        if (enemySpace < myLen * 2) score += (myLen * 2 - enemySpace) * 2;
        if (eDist <= 3) score += (4 - eDist) * 3;
    }
    return score;
}

function forceCollisionScore(pos, state) {
    const myLen = state.you.body.length;
    const { width, height } = state.board;
    let score = 0;
    for (const snake of state.board.snakes) {
        if (snake.id === state.you.id) continue;
        if (snake.body.length >= myLen) continue;
        const eHead = snake.body[0];
        const allBlocked = buildBlocked(state);
        allBlocked.add(`${pos.x},${pos.y}`);
        const enemyEscapes = neighbors(eHead).filter(n => {
            if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) return false;
            return !allBlocked.has(`${n.x},${n.y}`);
        }).length;
        if (enemyEscapes === 0) score += 50;
        else if (enemyEscapes === 1) score += 20;
        else if (enemyEscapes === 2) score += 8;
    }
    return score;
}

export default function move(gameState) {
    const START_TIME = Date.now();
    const TIME_LIMIT = 400;

    const head = gameState.you.body[0];
    const neck = gameState.you.body[1];
    const myLen = gameState.you.body.length;
    const myHealth = gameState.you.health;
    const { width, height } = gameState.board;

    const possibleMoves = {
        up:    { x: head.x,     y: head.y + 1 },
        down:  { x: head.x,     y: head.y - 1 },
        left:  { x: head.x - 1, y: head.y     },
        right: { x: head.x + 1, y: head.y     },
    };

    const safety = { up: true, down: true, left: true, right: true };

    if (neck.x < head.x) safety.left  = false;
    if (neck.x > head.x) safety.right = false;
    if (neck.y < head.y) safety.down  = false;
    if (neck.y > head.y) safety.up    = false;

    if (head.x === 0)          safety.left  = false;
    if (head.x === width - 1)  safety.right = false;
    if (head.y === 0)          safety.down  = false;
    if (head.y === height - 1) safety.up    = false;

    const blocked = buildBlocked(gameState);
    for (const [dir, pos] of Object.entries(possibleMoves)) {
        if (!safety[dir]) continue;
        if (blocked.has(`${pos.x},${pos.y}`)) safety[dir] = false;
    }

    const danger = enemyDangerZones(gameState);
    for (const [dir, pos] of Object.entries(possibleMoves)) {
        if (!safety[dir]) continue;
        if (danger.has(`${pos.x},${pos.y}`)) safety[dir] = false;
    }

    for (const [dir, pos] of Object.entries(possibleMoves)) {
        if (!safety[dir]) continue;
        if (floodFill(pos, gameState) < myLen) safety[dir] = false;
    }

    let validMoves = Object.keys(safety).filter(d => safety[d]);

    if (validMoves.length === 0) {
        console.log(`MOVE ${gameState.turn}: Relaxing safety constraints`);
        const loose = { up: true, down: true, left: true, right: true };

        if (neck.x < head.x) loose.left  = false;
        if (neck.x > head.x) loose.right = false;
        if (neck.y < head.y) loose.down  = false;
        if (neck.y > head.y) loose.up    = false;
        if (head.x === 0)          loose.left  = false;
        if (head.x === width - 1)  loose.right = false;
        if (head.y === 0)          loose.down  = false;
        if (head.y === height - 1) loose.up    = false;

        for (const [dir, pos] of Object.entries(possibleMoves)) {
            if (!loose[dir]) continue;
            if (blocked.has(`${pos.x},${pos.y}`)) loose[dir] = false;
        }

        validMoves = Object.keys(loose).filter(d => loose[d]);
    }

    if (validMoves.length === 0) {
        console.log(`MOVE ${gameState.turn}: Completely trapped — moving down`);
        return { move: "down" };
    }

    if (validMoves.length === 1) {
        console.log(`MOVE ${gameState.turn}: Only option — ${validMoves[0]}`);
        return { move: validMoves[0] };
    }

    const bestMove = minimaxRoot(gameState, validMoves, TIME_LIMIT);

    const needsFood = myHealth <= 50;
    const foodTarget = chooseFoodTarget(gameState);
    const targetType = foodTarget ? "food" :
        (gameState.board.snakes.some(s => s.id !== gameState.you.id && s.body.length < myLen)
            ? "hunt" : "none");

    const elapsed = Date.now() - START_TIME;
    console.log(
        `MOVE ${gameState.turn}: ${bestMove} | health=${myHealth} | target=${targetType} | ` +
        `valid=[${validMoves.join(",")}] | time=${elapsed}ms`
    );

    return { move: bestMove };
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
// it uses a multi layer decision system 1 it filters out unsafe moves like collisions and dangerous
//  head to head scenario 2 it sees each remaining move using three strategies the flood fill to measure available space
//  the a Voronoi algorithm to estimate territory control against other snake and distance to a target,
//  which is either food or weaker enemies 

//source https://youtu.be/Bxdt6T_1qgc?si=IiSDRa5G9pYBIl7d
// and https://docs.battlesnake.com/guides/useful-algorithms

