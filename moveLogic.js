export default function move(gameState) {

  const W = gameState.board.width;
  const H = gameState.board.height;
  const myHead = gameState.you.body[0];
  const myLength = gameState.you.body.length;
  const myHealth = gameState.you.health;

  const key = (x, y) => `${x},${y}`;

  const DIRS = {
    up:    { x: myHead.x,     y: myHead.y + 1 },
    down:  { x: myHead.x,     y: myHead.y - 1 },
    left:  { x: myHead.x - 1, y: myHead.y     },
    right: { x: myHead.x + 1, y: myHead.y     },
  };

  const inBounds = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

  const buildOccupied = (excludeTails = true) => {
    const occupied = new Set();
    for (const snake of gameState.board.snakes) {
      const justAte = snake.body[snake.body.length - 1].x === snake.body[snake.body.length - 2]?.x
                   && snake.body[snake.body.length - 1].y === snake.body[snake.body.length - 2]?.y;
      snake.body.forEach((seg, i) => {
        const isTail = i === snake.body.length - 1;
        if (excludeTails && isTail && !justAte) return; // tail will move
        occupied.add(key(seg.x, seg.y));
      });
    }
    return occupied;
  };


  const moveSafety = { up: true, down: true, left: true, right: true };


  if (myHead.x === 0)     moveSafety.left  = false;
  if (myHead.x === W - 1) moveSafety.right = false;
  if (myHead.y === 0)     moveSafety.down  = false;
  if (myHead.y === H - 1) moveSafety.up    = false;


  const myNeck = gameState.you.body[1];
  if (myNeck.x < myHead.x) moveSafety.left  = false;
  if (myNeck.x > myHead.x) moveSafety.right = false;
  if (myNeck.y < myHead.y) moveSafety.down  = false;
  if (myNeck.y > myHead.y) moveSafety.up    = false;

  const occupied = buildOccupied(true);
  for (const [dir, pos] of Object.entries(DIRS)) {
    if (!moveSafety[dir]) continue;
    if (occupied.has(key(pos.x, pos.y))) moveSafety[dir] = false;
  }

  
  for (const snake of gameState.board.snakes) {
    if (snake.id === gameState.you.id) continue;
    if (snake.body.length < myLength) continue; 
    const eHead = snake.body[0];
    const enemyNextMoves = new Set([
      key(eHead.x,     eHead.y + 1),
      key(eHead.x,     eHead.y - 1),
      key(eHead.x - 1, eHead.y    ),
      key(eHead.x + 1, eHead.y    ),
    ]);
    for (const [dir, pos] of Object.entries(DIRS)) {
      if (!moveSafety[dir]) continue;
      if (enemyNextMoves.has(key(pos.x, pos.y))) moveSafety[dir] = false;
    }
  }

  const safeMoves = Object.keys(moveSafety).filter(d => moveSafety[d]);

  if (safeMoves.length === 0) {
    console.log(`MOVE ${gameState.turn}: No safe moves — defaulting down`);
    return { move: "down" };
  }
  const occupiedStrict = buildOccupied(false);

  function floodFill(startX, startY, blocked) {
    const visited = new Set();
    const queue = [{ x: startX, y: startY }];
    visited.add(key(startX, startY));
    let count = 0;
    while (queue.length > 0) {
      const { x, y } = queue.shift();
      count++;
      for (const [dx, dy] of [[0,1],[0,-1],[-1,0],[1,0]]) {
        const nx = x + dx, ny = y + dy;
        const k = key(nx, ny);
        if (!inBounds(nx, ny)) continue;
        if (visited.has(k)) continue;
        if (blocked.has(k)) continue;
        visited.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
    return count;
  }

  function voronoiScore() {
    const dist = new Map();
    const queue = [];

  
    for (const snake of gameState.board.snakes) {
      const h = snake.body[0];
      const k = key(h.x, h.y);
      if (!dist.has(k)) {
        dist.set(k, { owner: snake.id, d: 0 });
        queue.push({ x: h.x, y: h.y, owner: snake.id, d: 0 });
      }
    }

    let qi = 0;
    while (qi < queue.length) {
      const { x, y, owner, d } = queue[qi++];
      for (const [dx, dy] of [[0,1],[0,-1],[-1,0],[1,0]]) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        if (occupiedStrict.has(key(nx, ny))) continue;
        const k = key(nx, ny);
        if (!dist.has(k)) {
          dist.set(k, { owner, d: d + 1 });
          queue.push({ x: nx, y: ny, owner, d: d + 1 });
        }
      }
    }

    let mine = 0, total = 0;
    for (const { owner } of dist.values()) {
      total++;
      if (owner === gameState.you.id) mine++;
    }
    return total > 0 ? mine / total : 0;
  }

  
  function findTarget() {
    const food = gameState.board.food;
    
    const hungry = myHealth < 40 || food.length === 0 ? true : myHealth < 70;

    if (hungry && food.length > 0) {
      
      return food.reduce((best, f) => {
        const d = Math.abs(f.x - myHead.x) + Math.abs(f.y - myHead.y);
        return d < best.d ? { pos: f, d } : best;
      }, { pos: null, d: Infinity }).pos;
    }


    let bestEnemy = null, bestDist = Infinity;
    for (const snake of gameState.board.snakes) {
      if (snake.id === gameState.you.id) continue;
      if (snake.body.length >= myLength) continue;
      const eHead = snake.body[0];
      const d = Math.abs(eHead.x - myHead.x) + Math.abs(eHead.y - myHead.y);
      if (d < bestDist) { bestDist = d; bestEnemy = eHead; }
    }
    if (bestEnemy) return bestEnemy;

    if (food.length > 0) {
      return food.reduce((best, f) => {
        const d = Math.abs(f.x - myHead.x) + Math.abs(f.y - myHead.y);
        return d < best.d ? { pos: f, d } : best;
      }, { pos: null, d: Infinity }).pos;
    }

    return null;
  }

  const target = findTarget();
  const totalCells = W * H;

  const W_FLOOD   = 0.5;
  const W_VORONOI = 0.3; 
  const W_TARGET  = 0.2; 
  
  const targetBoost = myHealth < 30 ? 0.4 : 0;

  const scores = {};

  for (const dir of safeMoves) {
    const pos = DIRS[dir];

    const fillBlocked = new Set(occupiedStrict);
    fillBlocked.delete(key(pos.x, pos.y)); // the cell we're moving into is passable
    const fillCount = floodFill(pos.x, pos.y, fillBlocked);
    const floodScore = fillCount / totalCells; // 0–1

    const voronoi = voronoiScore(); 
    let voronoiBias = 0;
    for (const snake of gameState.board.snakes) {
      if (snake.id === gameState.you.id) continue;
      const eHead = snake.body[0];
      const distNow  = Math.abs(myHead.x - eHead.x) + Math.abs(myHead.y - eHead.y);
      const distNext = Math.abs(pos.x    - eHead.x) + Math.abs(pos.y    - eHead.y);
    
      voronoiBias += (distNext - distNow) / (W + H);
    }
    const voronoiScore_ = Math.min(1, Math.max(0, voronoi + voronoiBias));

    
    let targetScore = 0.5; 
    if (target) {
      const distToTarget = Math.abs(pos.x - target.x) + Math.abs(pos.y - target.y);
      const maxDist = W + H;
      targetScore = 1 - distToTarget / maxDist; 
    }

    const wT = Math.min(W_TARGET + targetBoost, 0.6);
    const wF = W_FLOOD   * (1 - targetBoost);
    const wV = W_VORONOI * (1 - targetBoost);

    scores[dir] = wF * floodScore + wV * voronoiScore_ + wT * targetScore;

    console.log(`  [${dir}] flood=${floodScore.toFixed(2)} voronoi=${voronoiScore_.toFixed(2)} target=${targetScore.toFixed(2)} → ${scores[dir].toFixed(3)}`);
  }

  const bestMove = safeMoves.reduce((best, dir) =>
    scores[dir] > scores[best] ? dir : best
  , safeMoves[0]);

  console.log(`MOVE ${gameState.turn}: ${bestMove} (health=${myHealth}, safeMoves=[${safeMoves.join(",")}])`);
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


