const DEBUG = false;
const log = (...args) => DEBUG && console.log(...args);

export default function move(gameState) {
  const W = gameState.board.width;
  const H = gameState.board.height;
  const myHead = gameState.you.body[0];
  const myLength = gameState.you.body.length;
  const myHealth = gameState.you.health;
  const turn = gameState.turn;

  const key = (x, y) => `${x},${y}`;

  const DIRS = {
    up:    { x: myHead.x,     y: myHead.y + 1 },
    down:  { x: myHead.x,     y: myHead.y - 1 },
    left:  { x: myHead.x - 1, y: myHead.y     },
    right: { x: myHead.x + 1, y: myHead.y     },
  };

  const inBounds = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

  const hazardCells = new Set(
    (gameState.board.hazards ?? []).map(h => key(h.x, h.y))
  );
  const hazardDamage = gameState.game?.ruleset?.settings?.hazardDamagePerTurn ?? 14;
  const isInHazard = (x, y) => hazardCells.has(key(x, y));

  const shrinkInterval = gameState.game?.ruleset?.settings?.shrinkEveryNTurns ?? 25;
  const HAZARD_LOOKAHEAD = 3;

  const turnsUntilHazard = new Map();
  for (const k of hazardCells) turnsUntilHazard.set(k, 0);

  if (hazardCells.size > 0 && shrinkInterval > 0) {
    let frontier = new Set(hazardCells);
    for (let ring = 1; ring <= HAZARD_LOOKAHEAD; ring++) {
      const nextFrontier = new Set();
      for (const k of frontier) {
        const [cx, cy] = k.split(',').map(Number);
        for (const [dx, dy] of [[0,1],[0,-1],[-1,0],[1,0]]) {
          const nx = cx + dx, ny = cy + dy;
          if (!inBounds(nx, ny)) continue;
          const nk = key(nx, ny);
          if (turnsUntilHazard.has(nk)) continue;
          turnsUntilHazard.set(nk, ring * shrinkInterval);
          nextFrontier.add(nk);
        }
      }
      frontier = nextFrontier;
      if (frontier.size === 0) break;
    }
  }

  const turnsToHazard = (x, y) => turnsUntilHazard.get(key(x, y)) ?? Infinity;

  function buildDecayMap() {
    const decay = new Map();
    for (const snake of gameState.board.snakes) {
      const justAte =
        snake.body.length > 1 &&
        snake.body[snake.body.length - 1].x === snake.body[snake.body.length - 2].x &&
        snake.body[snake.body.length - 1].y === snake.body[snake.body.length - 2].y;
      snake.body.forEach((seg, i) => {
        const k = key(seg.x, seg.y);
        const stepsUntilClear = justAte
          ? snake.body.length - i
          : snake.body.length - i - 1;
        const clearsAt = turn + stepsUntilClear;
        if (!decay.has(k) || decay.get(k) < clearsAt) decay.set(k, clearsAt);
      });
    }
    return decay;
  }

  function buildDecayAwareBlocked(decayMap, stepsAway) {
    const blocked = new Set();
    for (const [k, clearsAt] of decayMap) {
      if (clearsAt > turn + stepsAway) blocked.add(k);
    }
    return blocked;
  }

  // ─── BODY COLLISION AVOIDANCE (IMPROVED) ────────────────────────────────────
  // Build occupied sets. We never move into any body segment that won't have
  // cleared by next turn (i.e. clearsAt > turn + 1 means it's still there).
  const buildOccupied = (excludeTails = true) => {
    const occ = new Set();
    for (const snake of gameState.board.snakes) {
      const justAte =
        snake.body.length > 1 &&
        snake.body[snake.body.length - 1].x === snake.body[snake.body.length - 2].x &&
        snake.body[snake.body.length - 1].y === snake.body[snake.body.length - 2].y;
      snake.body.forEach((seg, i) => {
        const isTail = i === snake.body.length - 1;
        // Tail is safe to enter UNLESS the snake just ate (tail won't shrink)
        if (excludeTails && isTail && !justAte) return;
        occ.add(key(seg.x, seg.y));
      });
    }
    return occ;
  };

  const occupied     = buildOccupied(true);
  const occupiedFull = buildOccupied(false);
  const decayMap     = buildDecayMap();

  const enemies = gameState.board.snakes.filter(s => s.id !== gameState.you.id);
  const is1v1   = enemies.length === 1;

  const enemyHunger = new Map();
  for (const snake of enemies) {
    const h = snake.health;
    enemyHunger.set(snake.id, { health: h, hungry: h < 70, starving: h < 25 });
  }

  // For each enemy classify threat level relative to us
  const enemyThreat = new Map();
  for (const snake of enemies) {
    const lengthDiff = myLength - snake.body.length;
    enemyThreat.set(snake.id, {
      bigger:      lengthDiff <= 0,
      equal:       lengthDiff === 0,
      smaller:     lengthDiff > 0,
      muchSmaller: lengthDiff >= 3,
      diff:        lengthDiff,
    });
  }

  const weAreBiggest = enemies.every(s => myLength > s.body.length);
  const dominantSize = myLength >= 2 + Math.max(...enemies.map(s => s.body.length), 0);

  // ─── HARD DANGER CELLS ───────────────────────────────────────────────────────
  // Cells we should NEVER move into regardless of score:
  //   1. Any enemy body segment (that won't have cleared by next turn)
  //   2. Enemy head cells (always lethal to collide with)
  //   3. Cells adjacent to an equal-or-bigger enemy head (head-on collision risk)
  //      EXCEPTION: we skip this hard block if we're bigger (we want to hunt them)
  const hardDangerCells = new Set();

  for (const snake of enemies) {
    const threat = enemyThreat.get(snake.id);
    const eHead  = snake.body[0];

    // Block the enemy head itself — moving onto it is always fatal
    hardDangerCells.add(key(eHead.x, eHead.y));

    // Block all body segments (excluding tail that will clear, same logic as occupied)
    const justAte =
      snake.body.length > 1 &&
      snake.body[snake.body.length - 1].x === snake.body[snake.body.length - 2].x &&
      snake.body[snake.body.length - 1].y === snake.body[snake.body.length - 2].y;
    snake.body.forEach((seg, i) => {
      const isTail = i === snake.body.length - 1;
      if (isTail && !justAte) return; // tail will move away
      hardDangerCells.add(key(seg.x, seg.y));
    });

    // Block cells adjacent to equal/bigger heads (head-on collision zone)
    // Only skip this if we're clearly dominant (we want to hunt smaller snakes)
    if (threat.bigger || threat.equal) {
      for (const [dx, dy] of [[0,1],[0,-1],[-1,0],[1,0]]) {
        hardDangerCells.add(key(eHead.x + dx, eHead.y + dy));
      }
    }
  }

  // ─── SCORE-ONLY SETS (kept for bonus/penalty scoring) ────────────────────────
  const h2hRisk = new Set(); // cells where enemy can eat us (penalise)
  const h2hKill = new Set(); // cells where WE can eat enemy (reward)

  for (const snake of enemies) {
    const threat = enemyThreat.get(snake.id);
    const hunger = enemyHunger.get(snake.id);
    const eHead  = snake.body[0];
    for (const [dx, dy] of [[0,1],[0,-1],[-1,0],[1,0]]) {
      const nx  = eHead.x + dx, ny = eHead.y + dy;
      const nk  = key(nx, ny);
      if (threat.smaller && !threat.equal) {
        h2hKill.add(nk);
      } else {
        const starvingWild = !threat.bigger && hunger?.starving;
        if (!threat.smaller || starvingWild) h2hRisk.add(nk);
      }
    }
  }

  // ─── SAFE MOVES ──────────────────────────────────────────────────────────────
  const moveSafety = { up: true, down: true, left: true, right: true };

  // Wall bounds
  if (myHead.x === 0)     moveSafety.left  = false;
  if (myHead.x === W - 1) moveSafety.right = false;
  if (myHead.y === 0)     moveSafety.down  = false;
  if (myHead.y === H - 1) moveSafety.up    = false;

  // Never reverse into neck
  const myNeck = gameState.you.body[1];
  if (myNeck.x < myHead.x) moveSafety.left  = false;
  if (myNeck.x > myHead.x) moveSafety.right = false;
  if (myNeck.y < myHead.y) moveSafety.down  = false;
  if (myNeck.y > myHead.y) moveSafety.up    = false;

  // Block any move that lands on an occupied cell (our own body + enemy bodies)
  for (const [dir, pos] of Object.entries(DIRS)) {
    if (!moveSafety[dir]) continue;
    if (occupied.has(key(pos.x, pos.y))) moveSafety[dir] = false;
  }

  // Block any move that lands on a hard danger cell (enemy heads + head-on zones)
  // But only if it would leave us with at least one other option — otherwise
  // accept the danger rather than guarantee death by having zero moves.
  const movesBeforeHardBlock = Object.keys(moveSafety).filter(d => moveSafety[d]);
  const hardBlocked = movesBeforeHardBlock.filter(d => hardDangerCells.has(key(DIRS[d].x, DIRS[d].y)));
  const afterHardBlock = movesBeforeHardBlock.filter(d => !hardDangerCells.has(key(DIRS[d].x, DIRS[d].y)));

  // Apply hard block only if it doesn't eliminate ALL options
  if (afterHardBlock.length > 0) {
    for (const dir of hardBlocked) {
      moveSafety[dir] = false;
    }
  } else {
    log(`MOVE ${turn}: Hard block would eliminate all moves — accepting danger`);
  }

  const safeMoves = Object.keys(moveSafety).filter(d => moveSafety[d]);

  if (safeMoves.length === 0) {
    log(`MOVE ${turn}: No safe moves — defaulting down`);
    return { move: "down" };
  }

  // ─── FLOOD FILL ──────────────────────────────────────────────────────────────
  function floodFill(startX, startY, blocked) {
    if (!inBounds(startX, startY)) return 0;
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
        if (!inBounds(nx, ny) || visited.has(k) || blocked.has(k)) continue;
        visited.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
    return count;
  }

  function floodFillHazardWeighted(startX, startY, lookahead) {
    if (!inBounds(startX, startY)) return 0;
    const blocked = buildDecayAwareBlocked(decayMap, lookahead);
    blocked.delete(key(startX, startY));
    const visited = new Set();
    const queue = [{ x: startX, y: startY, dist: 0 }];
    visited.add(key(startX, startY));
    let score = 0;
    while (queue.length > 0) {
      const { x, y, dist } = queue.shift();
      const tth = turnsToHazard(x, y);
      let weight;
      if (tth === 0) {
        weight = 0.15;
      } else if (tth !== Infinity && dist >= tth) {
        weight = 0.15;
      } else if (tth !== Infinity && dist >= tth - shrinkInterval) {
        weight = 0.5;
      } else {
        weight = 1.0;
      }
      score += weight;
      for (const [dx, dy] of [[0,1],[0,-1],[-1,0],[1,0]]) {
        const nx = x + dx, ny = y + dy;
        const nk = key(nx, ny);
        if (!inBounds(nx, ny) || visited.has(nk) || blocked.has(nk)) continue;
        visited.add(nk);
        queue.push({ x: nx, y: ny, dist: dist + 1 });
      }
    }
    return score;
  }

  // ─── A* ──────────────────────────────────────────────────────────────────────
  function aStarDist(sx, sy, tx, ty, blocked) {
    const heuristic = (x, y) => Math.abs(x - tx) + Math.abs(y - ty);
    const open = [{ x: sx, y: sy, g: 0, f: heuristic(sx, sy) }];
    const gScore = new Map();
    gScore.set(key(sx, sy), 0);
    while (open.length > 0) {
      open.sort((a, b) => a.f - b.f);
      const { x, y, g } = open.shift();
      if (x === tx && y === ty) return g;
      for (const [dx, dy] of [[0,1],[0,-1],[-1,0],[1,0]]) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const nk = key(nx, ny);
        if (blocked.has(nk) && !(nx === tx && ny === ty)) continue;
        const ng = g + 1;
        if (ng < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, ng);
          open.push({ x: nx, y: ny, g: ng, f: ng + heuristic(nx, ny) });
        }
      }
    }
    return Infinity;
  }

  // ─── VORONOI ─────────────────────────────────────────────────────────────────
  function voronoiDetailed(fromX, fromY) {
    const dist = new Map();
    const queue = [];
    {
      const k = key(fromX, fromY);
      dist.set(k, { owner: gameState.you.id, d: 0 });
      queue.push({ x: fromX, y: fromY, owner: gameState.you.id, d: 0 });
    }
    for (const snake of enemies) {
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
        if (occupiedFull.has(key(nx, ny))) continue;
        const k = key(nx, ny);
        if (!dist.has(k)) {
          dist.set(k, { owner, d: d + 1 });
          queue.push({ x: nx, y: ny, owner, d: d + 1 });
        }
      }
    }
    const counts = new Map();
    for (const { owner } of dist.values()) {
      counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    const total = dist.size;
    const mine  = counts.get(gameState.you.id) ?? 0;
    return { score: total > 0 ? mine / total : 0, counts, total };
  }

  // ─── CUTOFF ──────────────────────────────────────────────────────────────────
  function cutoffScore(pos) {
    if (!weAreBiggest) return 0;
    let totalCutoff = 0;
    for (const snake of enemies) {
      const eHead = snake.body[0];
      const blocked = new Set(occupiedFull);
      blocked.delete(key(pos.x, pos.y));
      blocked.add(key(myHead.x, myHead.y));
      const enemySpace = floodFill(eHead.x, eHead.y, blocked);
      const baseline   = floodFill(eHead.x, eHead.y, occupiedFull);
      const reduction  = Math.max(0, baseline - enemySpace);
      totalCutoff += reduction / (W * H);
    }
    return totalCutoff;
  }

  // ─── MINIMAX (1v1 only) ──────────────────────────────────────────────────────
  function minimaxEval(mHead, mBody, eHead, eBody, mHealth, eHealth, depth, alpha, beta, maximising) {
    const mAlive = inBounds(mHead.x, mHead.y);
    const eAlive = inBounds(eHead.x, eHead.y);
    if (!mAlive && !eAlive) return 0;
    if (!mAlive) return -1;
    if (!eAlive) return  1;
    if (depth === 0) {
      const bodies = new Set([...mBody.map(s => key(s.x, s.y)), ...eBody.map(s => key(s.x, s.y))]);
      bodies.delete(key(mHead.x, mHead.y));
      bodies.delete(key(eHead.x, eHead.y));
      const mFill = floodFill(mHead.x, mHead.y, bodies);
      const eFill = floodFill(eHead.x, eHead.y, bodies);
      const tot   = mFill + eFill;
      return tot > 0 ? (mFill - eFill) / tot : 0;
    }
    const moveDelta = [[0,1],[0,-1],[-1,0],[1,0]];
    if (maximising) {
      let best = -Infinity;
      for (const [dx, dy] of moveDelta) {
        const nx = mHead.x + dx, ny = mHead.y + dy;
        if (!inBounds(nx, ny)) continue;
        const nk = key(nx, ny);
        const mTailKey = key(mBody[mBody.length - 1].x, mBody[mBody.length - 1].y);
        const mBodySet = new Set(mBody.map(s => key(s.x, s.y)));
        mBodySet.delete(mTailKey);
        if (mBodySet.has(nk)) continue;
        const eTailKey = key(eBody[eBody.length - 1].x, eBody[eBody.length - 1].y);
        const eBodySet = new Set(eBody.map(s => key(s.x, s.y)));
        eBodySet.delete(eTailKey);
        if (eBodySet.has(nk)) continue;
        const newMHead = { x: nx, y: ny };
        const newMBody = [newMHead, ...mBody.slice(0, -1)];
        const val = minimaxEval(newMHead, newMBody, eHead, eBody, mHealth - 1, eHealth, depth - 1, alpha, beta, false);
        best  = Math.max(best, val);
        alpha = Math.max(alpha, val);
        if (beta <= alpha) break;
      }
      return best === -Infinity ? -1 : best;
    } else {
      let best = Infinity;
      for (const [dx, dy] of moveDelta) {
        const nx = eHead.x + dx, ny = eHead.y + dy;
        if (!inBounds(nx, ny)) continue;
        const nk = key(nx, ny);
        const eTailKey = key(eBody[eBody.length - 1].x, eBody[eBody.length - 1].y);
        const eBodySet = new Set(eBody.map(s => key(s.x, s.y)));
        eBodySet.delete(eTailKey);
        if (eBodySet.has(nk)) continue;
        const mTailKey = key(mBody[mBody.length - 1].x, mBody[mBody.length - 1].y);
        const mBodySet = new Set(mBody.map(s => key(s.x, s.y)));
        mBodySet.delete(mTailKey);
        if (mBodySet.has(nk)) continue;
        const newEHead = { x: nx, y: ny };
        const newEBody = [newEHead, ...eBody.slice(0, -1)];
        const val = minimaxEval(mHead, mBody, newEHead, newEBody, mHealth, eHealth - 1, depth - 1, alpha, beta, true);
        best = Math.min(best, val);
        beta = Math.min(beta, val);
        if (beta <= alpha) break;
      }
      return best === Infinity ? 1 : best;
    }
  }

  const MINIMAX_DEPTH = 4;
  const minimaxScores = {};
  if (is1v1) {
    const enemy = enemies[0];
    for (const dir of safeMoves) {
      const pos = DIRS[dir];
      const newMyHead = { x: pos.x, y: pos.y };
      const newMyBody = [newMyHead, ...gameState.you.body.slice(0, -1)];
      minimaxScores[dir] = minimaxEval(
        newMyHead, newMyBody,
        enemy.body[0], enemy.body,
        myHealth - 1, enemy.health,
        MINIMAX_DEPTH - 1, -Infinity, Infinity, false
      );
    }
  }

  // ─── FOOD TARGETING ──────────────────────────────────────────────────────────
  function scoreFoodItems(reachableFood) {
    if (reachableFood.length === 0) return null;
    return reachableFood.reduce((best, f) => {
      const myDist = aStarDist(myHead.x, myHead.y, f.x, f.y, occupiedFull);
      if (myDist === Infinity) return best;
      let minEnemyEffectiveDist = Infinity;
      for (const snake of enemies) {
        const eHead = snake.body[0];
        const rawDist = Math.abs(eHead.x - f.x) + Math.abs(eHead.y - f.y);
        const hunger  = enemyHunger.get(snake.id);
        const hungerBias = hunger?.starving ? 4 : hunger?.hungry ? 2 : 0;
        const effectiveDist = Math.max(0, rawDist - hungerBias);
        if (effectiveDist < minEnemyEffectiveDist) minEnemyEffectiveDist = effectiveDist;
      }
      const maxDist   = W + H;
      const advantage = (minEnemyEffectiveDist - myDist) / maxDist;
      const proximity = 1 - myDist / maxDist;
      const score     = 0.5 * proximity + 0.5 * advantage;
      return score > best.score ? { pos: f, score } : best;
    }, { pos: null, score: -Infinity }).pos;
  }

  function foodIsReachable(food) {
    return floodFill(food.x, food.y, occupiedFull) >= myLength;
  }

  function findTarget() {
    const food = gameState.board.food;
    const reachableFood = food.filter(foodIsReachable);

    if (dominantSize && myHealth > 50 && enemies.length > 0) {
      let bestEnemy = null, bestDist = Infinity;
      for (const snake of enemies) {
        const eHead = snake.body[0];
        const d = aStarDist(myHead.x, myHead.y, eHead.x, eHead.y, occupiedFull);
        if (d < bestDist) { bestDist = d; bestEnemy = eHead; }
      }
      if (bestEnemy) return bestEnemy;
    }

    const hungry = myHealth < 40 || reachableFood.length === 0 ? true : myHealth < 70;
    if (hungry && reachableFood.length > 0) {
      const best = scoreFoodItems(reachableFood);
      if (best) return best;
    }

    let bestEnemy = null, bestDist = Infinity;
    for (const snake of enemies) {
      if (snake.body.length >= myLength) continue;
      const eHead = snake.body[0];
      const d = aStarDist(myHead.x, myHead.y, eHead.x, eHead.y, occupiedFull);
      if (d < bestDist) { bestDist = d; bestEnemy = eHead; }
    }
    if (bestEnemy) return bestEnemy;

    if (reachableFood.length > 0) return scoreFoodItems(reachableFood);
    return null;
  }

  const target = findTarget();
  const totalCells = W * H;
  const DECAY_LOOKAHEAD = Math.min(10, Math.floor((W + H) / 2));

  const W_FLOOD    = is1v1 ? 0.10 : (weAreBiggest ? 0.15 : 0.35);
  const W_VORONOI  = is1v1 ? 0.20 : (weAreBiggest ? 0.40 : 0.35);
  const W_TARGET   = is1v1 ? 0.10 : (weAreBiggest ? 0.15 : 0.20);
  const W_MINIMAX  = is1v1 ? 0.40 : 0.00;
  const W_CUTOFF   = weAreBiggest ? 0.30 : 0.00;

  const hazardPenalty = (pos) => {
    const tth = turnsToHazard(pos.x, pos.y);
    const turnsOfHazardWeCanSurvive = Math.floor((myHealth - 1) / hazardDamage);
    if (tth === 0) {
      return turnsOfHazardWeCanSurvive <= 1 ? 0.50 : turnsOfHazardWeCanSurvive <= 3 ? 0.25 : 0.10;
    }
    if (tth <= shrinkInterval) {
      return turnsOfHazardWeCanSurvive <= 1 ? 0.25 : turnsOfHazardWeCanSurvive <= 3 ? 0.12 : 0.05;
    }
    if (tth <= shrinkInterval * 2) return 0.05;
    return 0;
  };

  const targetBoost = myHealth < 30 ? 0.35 : 0;

  // ─── SCORE EACH SAFE MOVE ────────────────────────────────────────────────────
  const scores = {};

  for (const dir of safeMoves) {
    const pos = DIRS[dir];

    const fillCount  = floodFillHazardWeighted(pos.x, pos.y, DECAY_LOOKAHEAD);
    const floodScore = fillCount / totalCells;

    const { score: voronoi } = voronoiDetailed(pos.x, pos.y);

    const cutoff = cutoffScore(pos);

    let targetScore = 0.5;
    if (target) {
      const distToTarget = aStarDist(pos.x, pos.y, target.x, target.y, occupiedFull);
      targetScore = distToTarget === Infinity ? 0
        : 1 - Math.min(distToTarget, W + H) / (W + H);
    }

    const wT = Math.min(W_TARGET + targetBoost, 0.55);
    const wF = W_FLOOD   * (1 - targetBoost);
    const wV = W_VORONOI * (1 - targetBoost);
    const wM = W_MINIMAX;
    const wC = W_CUTOFF  * (1 - targetBoost);

    const mmRaw  = minimaxScores[dir] ?? 0;
    const mmNorm = (mmRaw + 1) / 2;

    let score = wF * floodScore + wV * voronoi + wT * targetScore + wM * mmNorm + wC * cutoff;

    // Kill-zone bonus (we're bigger, drive into them), but NOT if it was hard-blocked above
    if (h2hKill.has(key(pos.x, pos.y))) {
      score += 0.30;
    }
    // h2hRisk: still penalise even if we allowed the move (edge case: no other options)
    if (h2hRisk.has(key(pos.x, pos.y))) {
      score -= 0.25;
    }

    score -= hazardPenalty(pos);

    scores[dir] = score;

    log(`  [${dir}] flood=${floodScore.toFixed(2)} voronoi=${voronoi.toFixed(2)} target=${targetScore.toFixed(2)} cutoff=${cutoff.toFixed(2)} minimax=${mmRaw.toFixed(2)} → ${score.toFixed(3)}`);
  }

  const bestMove = safeMoves.reduce((best, dir) =>
    scores[dir] > scores[best] ? dir : best,
    safeMoves[0]
  );

  log(`MOVE ${turn}: ${bestMove} (health=${myHealth}, dominant=${dominantSize}, 1v1=${is1v1})`);
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


