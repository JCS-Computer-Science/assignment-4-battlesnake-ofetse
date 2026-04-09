export default function move(gameState){
    let moveSafety = {
        up: true,
        down: true,
        left: true,
        right: true
    };

    const myHead = gameState.you.body[0];
    const myNeck = gameState.you.body[1];

    if (myNeck.x < myHead.x) {
         moveSafety.left = false;

        } else if (myNeck.x > myHead.x) { 
             moveSafety.right = false;
             } else if (myNeck.y < myHead.y) {
                moveSafety.down = false;
                } else if (myNeck.y > myHead.y) {
                    moveSafety.up = false;
    }

    const boardWidth = gameState.board.width;
    const boardHeight = gameState.board.height;

    if (myHead.x === 0) moveSafety.left = false;
    if (myHead.x === boardWidth - 1)  moveSafety.right = false;
    if (myHead.y === 0) moveSafety.down = false;
    if (myHead.y === boardHeight - 1) moveSafety.up = false;

    const candidates = {
        up:    { x: myHead.x, y: myHead.y + 1 },
        down:  { x: myHead.x, y: myHead.y - 1 },
        left:  { x: myHead.x - 1, y: myHead.y },
        right: { x: myHead.x + 1, y: myHead.y },
    };


for (const [dir, pos] of Object.entries(candidates)) {
        if (!moveSafety[dir]) continue; 
        const hitsBody = gameState.you.body.some(
            segment => segment.x === pos.x && segment.y === pos.y
        );
        if (hitsBody) moveSafety[dir] = false;
    }
     for (const snake of gameState.board.snakes) {
        for (const [dir, pos] of Object.entries(candidates)) {
            if (!moveSafety[dir]) continue;
            const hitsSnake = snake.body.some(
                segment => segment.x === pos.x && segment.y === pos.y
            );

             if (hitsSnake) moveSafety[dir] = false;
        }
    }
     const myLength = gameState.you.body.length;
      for (const snake of gameState.board.snakes) {
        if (snake.id === gameState.you.id) continue;
        if (snake.body.length < myLength) continue;

        const enemyHead = snake.body[0];
        const enemyMoves = [
            { x: enemyHead.x,     y: enemyHead.y + 1 },
            { x: enemyHead.x,     y: enemyHead.y - 1 },
            { x: enemyHead.x - 1, y: enemyHead.y     },
            { x: enemyHead.x + 1, y: enemyHead.y     },
        ];

        for (const [dir, pos] of Object.entries(candidates)) {

            if (!moveSafety[dir]) continue;
            const dangerousSquare = enemyMoves.some(
                e => e.x === pos.x && e.y === pos.y
            );

            if (dangerousSquare) moveSafety[dir] = false;
        }
    }

     const safeMoves = Object.keys(moveSafety).filter(direction => moveSafety[direction]);
    if (safeMoves.length == 0) {
        console.log(`MOVE ${gameState.turn}: No safe moves detected! Moving down`);
        return { move: "down" };
    }


const food = gameState.board.food;
    let nextMove = safeMoves[Math.floor(Math.random() * safeMoves.length)];

    if (food.length > 0) {
        const closestFood = food.reduce((best, f) => {
            const dist = Math.abs(f.x - myHead.x) + Math.abs(f.y - myHead.y);

             return dist < best.dist ? { food: f, dist } : best;
        }, { food: null, dist: Infinity }).food;

        let bestDir = null;
        let bestDist = Infinity;
        for (const dir of safeMoves) {
            const pos = candidates[dir];
            const dist = Math.abs(pos.x - closestFood.x) + Math.abs(pos.y - closestFood.y);
            if (dist < bestDist) {
                bestDist = dist;
                bestDir = dir;
            }
        }
        if (bestDir) nextMove = bestDir;
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