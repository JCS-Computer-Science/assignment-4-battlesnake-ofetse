function floodFill(pos, gameState) {
    const boardWidth = gameState.board.width;
    const boardHeight = gameState.board.height;

    const blocked = new Set();
    for (const snake of gameState.board.snakes) {
        for (const segment of snake.body) {
            blocked.add(`${segment.x},${segment.y}`);
        }
    }

    const visited = new Set();
    const queue = [pos];
    visited.add(`${pos.x},${pos.y}`);

    while (queue.length > 0) {
        const current = queue.shift();

        const neighbors = [
            { x: current.x,     y: current.y + 1 },
            { x: current.x,     y: current.y - 1 },
            { x: current.x - 1, y: current.y     },
            { x: current.x + 1, y: current.y     },
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

function voronoiScore(myStart, gameState) {
    const boardWidth = gameState.board.width;
    const boardHeight = gameState.board.height;

    const blocked = new Set();
    for (const snake of gameState.board.snakes) {
        for (const segment of snake.body) {
            blocked.add(`${segment.x},${segment.y}`);
        }
    }

    const owner = {};
    const queue = [];

    const myKey = `${myStart.x},${myStart.y}`;
    owner[myKey] = { id: gameState.you.id, dist: 0 };
    queue.push({ x: myStart.x, y: myStart.y, id: gameState.you.id, dist: 0 });

    for (const snake of gameState.board.snakes) {
        if (snake.id === gameState.you.id) continue;

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
            { x: current.x,     y: current.y + 1 },
            { x: current.x,     y: current.y - 1 },
            { x: current.x - 1, y: current.y     },
            { x: current.x + 1, y: current.y     },
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
        if (owner[key].id === gameState.you.id) mySquares++;
    }

    return mySquares;
}

export default function move(gameState) {
    let directionSafety = {
        up: true,
        down: true,
        left: true,
        right: true
    };

    const head = gameState.you.body[0];
    const neck = gameState.you.body[1];

    if (neck.x < head.x) {
        directionSafety.left = false;
    } else if (neck.x > head.x) {
        directionSafety.right = false;
    } else if (neck.y < head.y) {
        directionSafety.down = false;
    } else if (neck.y > head.y) {
        directionSafety.up = false;
    }

    const boardWidth = gameState.board.width;
    const boardHeight = gameState.board.height;

    if (head.x === 0) directionSafety.left = false;
    if (head.x === boardWidth - 1) directionSafety.right = false;
    if (head.y === 0) directionSafety.down = false;
    if (head.y === boardHeight - 1) directionSafety.up = false;

    const possibleMoves = {
        up:    { x: head.x, y: head.y + 1 },
        down:  { x: head.x, y: head.y - 1 },
        left:  { x: head.x - 1, y: head.y },
        right: { x: head.x + 1, y: head.y },
    };

    for (const [dir, pos] of Object.entries(possibleMoves)) {
        if (!directionSafety[dir]) continue;

        const selfCollision = gameState.you.body.some(
            segment => segment.x === pos.x && segment.y === pos.y
        );

        if (selfCollision) directionSafety[dir] = false;
    }

    for (const snake of gameState.board.snakes) {
        for (const [dir, pos] of Object.entries(possibleMoves)) {
            if (!directionSafety[dir]) continue;

            const snakeCollision = snake.body.some(
                segment => segment.x === pos.x && segment.y === pos.y
            );

            if (snakeCollision) directionSafety[dir] = false;
        }
    }

    const snakeSize = gameState.you.body.length;

    for (const snake of gameState.board.snakes) {
        if (snake.id === gameState.you.id) continue;
        if (snake.body.length < snakeSize) continue;

        const enemyHead = snake.body[0];
        const enemyMoves = [
            { x: enemyHead.x,     y: enemyHead.y + 1 },
            { x: enemyHead.x,     y: enemyHead.y - 1 },
            { x: enemyHead.x - 1, y: enemyHead.y     },
            { x: enemyHead.x + 1, y: enemyHead.y     },
        ];

        for (const [dir, pos] of Object.entries(possibleMoves)) {
            if (!directionSafety[dir]) continue;

            const dangerousSquare = enemyMoves.some(
                e => e.x === pos.x && e.y === pos.y
            );

            if (dangerousSquare) directionSafety[dir] = false;
        }
    }

    const validMoves = Object.keys(directionSafety).filter(
        direction => directionSafety[direction]
    );

    if (validMoves.length == 0) {
        console.log(`MOVE ${gameState.turn}: No safe moves detected! Moving down`);
        return { move: "down" };
    }

    const food = gameState.board.food;
    const smallerSnakes = gameState.board.snakes.filter(
        snake => snake.id !== gameState.you.id && snake.body.length < snakeSize
    );

    const targetPos =
        smallerSnakes.length > 0
            ? smallerSnakes.reduce((best, snake) => {
                  const dist =
                      Math.abs(snake.body[0].x - head.x) +
                      Math.abs(snake.body[0].y - head.y);
                  return dist < best.dist
                      ? { pos: snake.body[0], dist }
                      : best;
              }, { pos: null, dist: Infinity }).pos
            : food.length > 0
            ? food.reduce((best, f) => {
                  const dist =
                      Math.abs(f.x - head.x) +
                      Math.abs(f.y - head.y);
                  return dist < best.dist
                      ? { pos: f, dist }
                      : best;
              }, { pos: null, dist: Infinity }).pos
            : null;

    let nextMove = validMoves[0];
    let bestScore = -Infinity;

    for (const dir of validMoves) {
        const pos = possibleMoves[dir];
        const space = floodFill(pos, gameState);
        const territory = voronoiScore(pos, gameState);

        const targetDist = targetPos
            ? Math.abs(pos.x - targetPos.x) +
              Math.abs(pos.y - targetPos.y)
            : 0;

        const score =
            (space * 2) +
            (territory * 3) +
            (-targetDist * 1);

        if (score > bestScore) {
            bestScore = score;
            nextMove = dir;
        }
    }

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

