export default function move(gameState){
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
    if (head.x === boardWidth - 1)  directionSafety.right = false;
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

    const validMoves = Object.keys(directionSafety).filter(direction => directionSafety[direction]);
    if (validMoves.length == 0) {
        console.log(`MOVE ${gameState.turn}: No safe moves detected! Moving down`);
        return { move: "down" };
    }

    const food = gameState.board.food;
    let nextMove = validMoves[Math.floor(Math.random() * validMoves.length)];

    if (food.length > 0) {
        const nearestFood = food.reduce((best, f) => {
            const dist = Math.abs(f.x - head.x) + Math.abs(f.y - head.y);
            return dist < best.dist ? { food: f, dist } : best;
        }, { food: null, dist: Infinity }).food;

        let bestDirection = null;
        let bestDist = Infinity;
        for (const dir of validMoves) {
            const pos = possibleMoves[dir];
            const dist = Math.abs(pos.x - nearestFood.x) + Math.abs(pos.y - nearestFood.y);
            if (dist < bestDist) {
                bestDist = dist;
                bestDirection = dir;
            }
        }
        if (bestDirection) nextMove = bestDirection;
    }

    console.log(`MOVE ${gameState.turn}: ${nextMove}`)
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