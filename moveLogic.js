const transpositionTable = new Map();
const DIRS = ["up","down","left","right"];
const DELTAS = { up:{x:0,y:1}, down:{x:0,y:-1}, left:{x:-1,y:0}, right:{x:1,y:0} };

function boardHash(gs) {
    return gs.board.snakes
        .map(s => `${s.id}:${s.body.map(b=>`${b.x},${b.y}`).join(';')}:${s.health}`)
        .sort().join('|');
}

function floodFill(pos, gs, ignoreTail=false) {
    const {width,height} = gs.board;
    const blocked = new Set();
    for (const s of gs.board.snakes)
        for (const seg of (ignoreTail ? s.body.slice(0,-1) : s.body))
            blocked.add(`${seg.x},${seg.y}`);

    const visited = new Set([`${pos.x},${pos.y}`]);
    const queue = [pos];
    while (queue.length) {
        const {x,y} = queue.shift();
        for (const {x:nx,y:ny} of [{x,y:y+1},{x,y:y-1},{x:x-1,y},{x:x+1,y}]) {
            const key = `${nx},${ny}`;
            if (nx<0||nx>=width||ny<0||ny>=height||blocked.has(key)||visited.has(key)) continue;
            visited.add(key); queue.push({x:nx,y:ny});
        }
    }
    return visited.size;
}

function voronoiScore(gs, myId) {
    const {width,height} = gs.board;
    const blocked = new Set();
    for (const s of gs.board.snakes)
        for (const seg of s.body.slice(0,-1))
            blocked.add(`${seg.x},${seg.y}`);

    const owner = {}, queue = [];
    for (const s of gs.board.snakes) {
        const key = `${s.body[0].x},${s.body[0].y}`;
        if (!owner[key]) { owner[key]={id:s.id,dist:0}; queue.push({x:s.body[0].x,y:s.body[0].y,id:s.id,dist:0}); }
    }

    let qi=0;
    while (qi<queue.length) {
        const {x,y,id,dist} = queue[qi++];
        for (const {x:nx,y:ny} of [{x,y:y+1},{x,y:y-1},{x:x-1,y},{x:x+1,y}]) {
            const key=`${nx},${ny}`;
            if (nx<0||nx>=width||ny<0||ny>=height||blocked.has(key)||owner[key]) continue;
            owner[key]={id,dist:dist+1}; queue.push({x:nx,y:ny,id,dist:dist+1});
        }
    }

    return Object.values(owner).filter(v=>v.id===myId).length;
}

function cloneGameState(gs) {
    return {
        turn: gs.turn,
        board: {
            width: gs.board.width, height: gs.board.height,
            food: gs.board.food.map(f=>({...f})),
            snakes: gs.board.snakes.map(s=>({...s, body:s.body.map(seg=>({...seg})), head:{...s.body[0]}, health:s.health})),
        },
        you: null,
    };
}

function applyMoves(gs, moveMap) {
    const next = cloneGameState(gs);
    for (const s of next.board.snakes) {
        const {x:dx,y:dy} = DELTAS[moveMap[s.id]||"up"];
        const newHead = {x:s.body[0].x+dx, y:s.body[0].y+dy};
        s.body.unshift(newHead); s.head=newHead;
    }

    const foodSet = new Set(next.board.food.map(f=>`${f.x},${f.y}`));
    const eaten = new Set();
    for (const s of next.board.snakes) {
        const k=`${s.body[0].x},${s.body[0].y}`;
        if (foodSet.has(k)) { s.health=100; eaten.add(k); }
        else { s.health=(s.health||100)-1; s.body.pop(); }
    }
    next.board.food = next.board.food.filter(f=>!eaten.has(`${f.x},${f.y}`));

    const allHeads = next.board.snakes.map(s=>({id:s.id,x:s.body[0].x,y:s.body[0].y,len:s.body.length}));
    next.board.snakes = next.board.snakes.filter(s => {
        const {x,y}=s.body[0], {width,height}=next.board;
        if (x<0||x>=width||y<0||y>=height) return false;
        if ((s.health||100)<=0) return false;
        if (s.body.slice(1).some(seg=>seg.x===x&&seg.y===y)) return false;
        if (allHeads.some(o=>o.id!==s.id&&o.x===x&&o.y===y&&o.len>=s.body.length)) return false;
        return true;
    });

    next.you = next.board.snakes.find(s=>s.id===gs.you.id)||null;
    return next;
}

function getSnakeMoves(snake, gs) {
    const {width,height}=gs.board, head=snake.body[0], neck=snake.body[1];
    return DIRS.filter(dir => {
        const {x:dx,y:dy}=DELTAS[dir], nx=head.x+dx, ny=head.y+dy;
        if (nx<0||nx>=width||ny<0||ny>=height) return false;
        if (neck&&nx===neck.x&&ny===neck.y) return false;
        return true;
    });
}

function predictEnemyMove(enemy, gs) {
    const moves = getSnakeMoves(enemy, gs);
    if (!moves.length) return "down";
    let bestMove=moves[0], bestSpace=-1;
    for (const dir of moves) {
        const {x:dx,y:dy}=DELTAS[dir];
        const space=floodFill({x:enemy.body[0].x+dx,y:enemy.body[0].y+dy},gs,true);
        if (space>bestSpace) { bestSpace=space; bestMove=dir; }
    }
    return bestMove;
}

function aStar(start, goal, gs) {
    const {width,height}=gs.board;
    const blocked=new Set();
    for (const s of gs.board.snakes)
        for (const seg of s.body.slice(0,-1))
            blocked.add(`${seg.x},${seg.y}`);

    const h=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
    const open=[{x:start.x,y:start.y,g:0,f:h(start,goal)}];
    const gScore={[`${start.x},${start.y}`]:0};

    while (open.length) {
        open.sort((a,b)=>a.f-b.f);
        const cur=open.shift();
        if (cur.x===goal.x&&cur.y===goal.y) return cur.g;
        for (const {x:nx,y:ny} of [{x:cur.x,y:cur.y+1},{x:cur.x,y:cur.y-1},{x:cur.x-1,y:cur.y},{x:cur.x+1,y:cur.y}]) {
            const key=`${nx},${ny}`;
            if (nx<0||nx>=width||ny<0||ny>=height||blocked.has(key)) continue;
            const tg=cur.g+1;
            if (gScore[key]===undefined||tg<gScore[key]) { gScore[key]=tg; open.push({x:nx,y:ny,g:tg,f:tg+h({x:nx,y:ny},goal)}); }
        }
    }
    return Infinity;
}

function getWeights(gs, me) {
    const low=me.health<40;
    if (gs.board.snakes.length===2) return {space:3,territory:4,length:3,food:low?4:0.5};
    if (gs.turn<50)                 return {space:2,territory:2,length:4,food:low?5:2};
    return                                 {space:3,territory:3,length:2,food:low?5:1};
}

function evaluate(gs, myId) {
    const me=gs.board.snakes.find(s=>s.id===myId);
    if (!me) return -10000;
    if (gs.board.snakes.length===1) return 10000;

    const head=me.body[0], space=floodFill(head,gs,true), territory=voronoiScore(gs,myId), w=getWeights(gs,me);
    const healthPenalty = me.health<30?(30-me.health)*5:me.health<50?(50-me.health)*1:0;

    let foodBonus=0;
    if (me.health<50&&gs.board.food.length>0) {
        const nearest=Math.min(...gs.board.food.map(f=>Math.abs(f.x-head.x)+Math.abs(f.y-head.y)));
        foodBonus=(50-nearest)*w.food;
    }

    let endBonus=0;
    if (gs.board.snakes.length===2) {
        const enemy=gs.board.snakes.find(s=>s.id!==myId);
        if (enemy&&me.body.length>enemy.body.length+3) {
            const tailDist=aStar(head,me.body[me.body.length-1],gs);
            endBonus=Math.max(0,20-tailDist)*2;
        }
    }

    return space*w.space + territory*w.territory + me.body.length*w.length - healthPenalty + foodBonus + endBonus;
}

function buildEnemyCombos(enemies, myMove, myHead, gs) {
    const combos=[{}];
    for (const enemy of enemies) {
        const {x:dx,y:dy}=DELTAS[myMove];
        const next={x:myHead.x+dx,y:myHead.y+dy};
        const dist=Math.abs(enemy.body[0].x-next.x)+Math.abs(enemy.body[0].y-next.y);
        if (dist<=2) {
            const eMoves=getSnakeMoves(enemy,gs);
            const valid=eMoves.length?eMoves:["down"];
            const newCombos=[];
            for (const c of combos) for (const em of valid) newCombos.push({...c,[enemy.id]:em});
            combos.length=0; combos.push(...newCombos);
        } else {
            const pred=predictEnemyMove(enemy,gs);
            for (const c of combos) c[enemy.id]=pred;
        }
    }
    return combos;
}

function minimax(gs, depth, alpha, beta, myId, startTime, timeLimit) {
    if (Date.now()-startTime>=timeLimit) return evaluate(gs,myId);
    const hash=boardHash(gs);
    if (transpositionTable.has(hash)) return transpositionTable.get(hash);

    const me=gs.board.snakes.find(s=>s.id===myId);
    if (depth===0||!me||!gs.board.snakes.length) { const s=evaluate(gs,myId); transpositionTable.set(hash,s); return s; }

    const enemies=gs.board.snakes.filter(s=>s.id!==myId);
    const myMoves=getSnakeMoves(me,gs);
    if (!myMoves.length) return -10000;

    let best=-Infinity;
    for (const myMove of myMoves) {
        if (Date.now()-startTime>=timeLimit) break;
        let worst=Infinity;
        for (const combo of buildEnemyCombos(enemies,myMove,me.body[0],gs)) {
            const score=minimax(applyMoves(gs,{[myId]:myMove,...combo}),depth-1,alpha,beta,myId,startTime,timeLimit);
            if (score<worst) worst=score;
            if (worst<beta) beta=worst;
            if (alpha>=beta) break;
        }
        if (worst>best) best=worst;
        if (best>alpha) alpha=best;
        if (alpha>=beta) break;
    }

    transpositionTable.set(hash,best);
    return best;
}

function iterativeDeepeningMinimax(gs, myId, validMoves, possible, timeLimit) {
    const startTime=Date.now();
    const cx=(gs.board.width-1)/2, cy=(gs.board.height-1)/2;
    let bestMove=validMoves[0];

    for (let depth=1; Date.now()-startTime<timeLimit&&depth<=10; depth++) {
        let bestScore=-Infinity, bestMoveThisDepth=validMoves[0];
        const enemies=gs.board.snakes.filter(s=>s.id!==myId);

        for (const dir of validMoves) {
            if (Date.now()-startTime>=timeLimit) break;
            let worst=Infinity;
            for (const combo of buildEnemyCombos(enemies,dir,gs.you.body[0],gs)) {
                const score=minimax(applyMoves(gs,{[myId]:dir,...combo}),depth-1,-Infinity,Infinity,myId,startTime,timeLimit);
                if (score<worst) worst=score;
            }
            const {x,y}=possible[dir];
            const finalScore=worst-(Math.abs(x-cx)+Math.abs(y-cy))*0.5;
            if (finalScore>bestScore) { bestScore=finalScore; bestMoveThisDepth=dir; }
        }
        bestMove=bestMoveThisDepth;
    }
    return bestMove;
}

export default function move(gs) {
    transpositionTable.clear();
    const {body:[head,neck],id:myId,health}=gs.you;
    const {width,height,snakes,food}=gs.board;

    const possible={
        up:{x:head.x,y:head.y+1}, down:{x:head.x,y:head.y-1},
        left:{x:head.x-1,y:head.y}, right:{x:head.x+1,y:head.y},
    };

    const safe={up:true,down:true,left:true,right:true};
    if (neck.x<head.x) safe.left=false; else if (neck.x>head.x) safe.right=false;
    else if (neck.y<head.y) safe.down=false; else safe.up=false;

    if (head.x===0)        safe.left=false;
    if (head.x===width-1)  safe.right=false;
    if (head.y===0)        safe.down=false;
    if (head.y===height-1) safe.up=false;

    const bodySet=new Set();
    for (const s of snakes) for (const seg of s.body.slice(0,-1)) bodySet.add(`${seg.x},${seg.y}`);
    for (const [dir,pos] of Object.entries(possible))
        if (safe[dir]&&bodySet.has(`${pos.x},${pos.y}`)) safe[dir]=false;

    const myLen=gs.you.body.length;
    for (const s of snakes) {
        if (s.id===myId||s.body.length<myLen) continue;
        const eHead=s.body[0];
        const eMoves=[{x:eHead.x,y:eHead.y+1},{x:eHead.x,y:eHead.y-1},{x:eHead.x-1,y:eHead.y},{x:eHead.x+1,y:eHead.y}];
        for (const [dir,pos] of Object.entries(possible))
            if (safe[dir]&&eMoves.some(e=>e.x===pos.x&&e.y===pos.y)) safe[dir]=false;
    }

    const nearMatch=snakes.some(s=>s.id!==myId&&s.body.length>=myLen-2);
    const needsFood=health<30||nearMatch;
    const smaller=snakes.filter(s=>s.id!==myId&&s.body.length<myLen);

    const target=smaller.length&&!needsFood
        ? smaller.reduce((b,s)=>{const d=aStar(head,s.body[0],gs);return d<b.dist?{pos:s.body[0],dist:d}:b},{pos:null,dist:Infinity}).pos
        : needsFood&&food.length
        ? food.reduce((b,f)=>{const d=aStar(head,f,gs);return d<b.dist?{pos:f,dist:d}:b},{pos:null,dist:Infinity}).pos
        : null;

    let validMoves=Object.keys(safe).filter(d=>safe[d]);

    if (!validMoves.length) {
        const fallback=Object.entries(possible)
            .filter(([,p])=>p.x>=0&&p.x<width&&p.y>=0&&p.y<height)
            .map(([dir,p])=>({dir,space:floodFill(p,gs,true)}))
            .sort((a,b)=>b.space-a.space)[0];
        return {move:fallback?fallback.dir:"up"};
    }

    if (target) validMoves.sort((a,b)=>aStar(possible[a],target,gs)-aStar(possible[b],target,gs));

    const nextMove=iterativeDeepeningMinimax(gs,myId,validMoves,possible,400);
    console.log(`MOVE ${gs.turn}: ${nextMove}`);
    return {move:nextMove};
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