// main.js - game loop and glue
import { NeuralAgent } from './ai.js';
import { Player, Enemy, Bullet } from './entities.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const hud = document.getElementById('hud');
const statusEl = document.getElementById('status');

const MAX_NEAREST = 3;
const SHOP_INTERVAL = 18.0;
const SHOP_DURATION = 4.0;
const SHOP_OPTIONS = [
  {name: "Max Health +20", key: "max_health", amount: 20, cost: 30},
  {name: "Damage +6", key: "damage", amount: 6, cost: 40},
  {name: "Speed +20", key: "speed", amount: 20, cost: 35},
  {name: "Fire Rate +1", key: "firerate", amount: 1, cost: 45},
];

let agent = new NeuralAgent({inputSize:14, hiddenSize:32, outputSize:5});
let player = new Player(W/2, H/2, agent.state);
let bullets = [];
let enemies = [];
let lastTime = performance.now();
let training = false;
let shopTimer = SHOP_INTERVAL;
let shopOpen = false;
let shopTimeLeft = 0;
let episodeTime = 0;
let mouse = {x: W/2, y: H/2};

document.getElementById('btn-save').onclick = () => { agent.save(); statusEl.textContent = "Status: saved to localStorage"; };
document.getElementById('btn-load').onclick = () => { agent.loadIfExists(); player.applyState(agent.state); statusEl.textContent = "Status: loaded from localStorage"; };
document.getElementById('btn-export').onclick = () => {
  const data = agent.exportJSON();
  const blob = new Blob([data], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'agent.json';
  a.click();
  URL.revokeObjectURL(url);
};
const inputFile = document.getElementById('file-import');
inputFile.onchange = (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      agent.importJSON(r.result);
      player.applyState(agent.state);
      statusEl.textContent = "Status: imported agent";
    } catch(e) { statusEl.textContent = "Import failed"; }
  };
  r.readAsText(f);
};
document.getElementById('btn-toggle-train').onclick = () => { training = !training; statusEl.textContent = "Status: training=" + training; };

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
  mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
});

window.addEventListener('keydown', (e) => {
  if (e.key === '1' || e.key === '2' || e.key === '3') {
    const kind = (e.key === '1') ? 'melee' : (e.key === '2') ? 'ranged' : 'fast';
    enemies.push(new Enemy(mouse.x, mouse.y, kind));
  }
  if (e.key === 's' || e.key === 'S') agent.save();
  if (e.key === 'l' || e.key === 'L') { agent.loadIfExists(); player.applyState(agent.state); }
  if (e.key === 't' || e.key === 'T') { training = !training; statusEl.textContent = "Status: training=" + training; }
});

function collectInputs(player, enemies) {
  const inputs = [];
  inputs.push(player.health / Math.max(1, player.maxHealth));
  inputs.push(player.currency / 100.0);
  const sorted = enemies.slice().sort((a,b) => ((a.x-player.x)**2+(a.y-player.y)**2) - ((b.x-player.x)**2+(b.y-player.y)**2));
  for (let i=0;i<MAX_NEAREST;i++) {
    if (i < sorted.length) {
      const e = sorted[i];
      inputs.push((e.x - player.x) / W);
      inputs.push((e.y - player.y) / H);
      const d = Math.hypot((e.x-player.x)/W, (e.y-player.y)/H);
      inputs.push(d);
      let kind_code = 0;
      if (e.kind === 'melee') kind_code = 0.0;
      else if (e.kind === 'ranged') kind_code = 0.5;
      else if (e.kind === 'fast') kind_code = 1.0;
      inputs.push(kind_code);
    } else {
      inputs.push(0,0,0,0);
    }
  }
  // ensure fixed length
  while (inputs.length < 14) inputs.push(0);
  return inputs.slice(0,14);
}

function openShopAndApply() {
  const inputs = collectInputs(player, enemies);
  const decision = agent.decide(inputs);
  const val = decision.shopValue;
  let idx = Math.floor(((Math.tanh(val)+1)/2) * SHOP_OPTIONS.length);
  idx = Math.max(0, Math.min(SHOP_OPTIONS.length-1, idx));
  const opt = SHOP_OPTIONS[idx];
  if (player.currency >= opt.cost) {
    const up = agent.state.upgrades || {};
    up[opt.key] = (up[opt.key] || 0) + opt.amount;
    agent.state.upgrades = up;
    player.currency -= opt.cost;
    player.applyState(agent.state);
    return {ok:true, opt};
  }
  return {ok:false, opt};
}

function spawnAmbient() {
  if (Math.random() < 0.85 && enemies.length < 24) {
    const side = Math.floor(Math.random()*4);
    let x,y;
    if (side === 0) { x = -20; y = Math.random()*H; }
    else if (side === 1) { x = W + 20; y = Math.random()*H; }
    else if (side === 2) { x = Math.random()*W; y = -20; }
    else { x = Math.random()*W; y = H + 20; }
    const k = (Math.random()<0.4)?'melee':(Math.random()<0.7?'ranged':'fast');
    enemies.push(new Enemy(x,y,k));
  }
}

function stepSimulation(dt) {
  // agent decision
  const inputs = collectInputs(player, enemies);
  const dec = agent.decide(inputs);
  let mx = dec.move[0], my = dec.move[1];
  const l = Math.hypot(mx,my);
  if (l > 1e-6) { mx /= l; my /= l; }
  player.x += mx * player.moveSpeed * dt;
  player.y += my * player.moveSpeed * dt;
  player.x = clamp(player.x, 0, W); player.y = clamp(player.y, 0, H);

  player.fireTimer = Math.max(0, player.fireTimer - dt);
  if (dec.shootProb > 0.55 && player.fireTimer <= 1e-6) {
    if (enemies.length) {
      const en = enemies.reduce((a,b)=> ((a.x-player.x)**2+(a.y-player.y)**2) < ((b.x-player.x)**2+(b.y-player.y)**2) ? a : b);
      const dx = en.x - player.x, dy = en.y - player.y;
      const dd = Math.hypot(dx,dy) + 1e-6;
      const vx = dx/dd, vy = dy/dd;
      bullets.push(new Bullet(player.x + vx*(player.radius+6), player.y + vy*(player.radius+6), vx, vy, player, player.damage, 420));
      player.fireTimer = player.fireCooldown;
    }
  }

  // bullets
  for (let i = bullets.length-1; i>=0; i--) {
    const b = bullets[i];
    b.update(dt, {w:W, h:H});
    if (!b.alive) { bullets.splice(i,1); continue; }
    // collision with enemies
    if (b.owner === player) {
      for (let j = enemies.length-1; j>=0; j--) {
        const e = enemies[j];
        if ((b.x - e.x)**2 + (b.y - e.y)**2 < (b.radius+e.radius)**2) {
          e.health -= b.damage;
          b.alive = false;
          if (e.health <= 0 && e.alive) {
            e.alive = false; enemies.splice(j,1);
            player.kills += 1; player.currency += 15;
          }
          break;
        }
      }
    } else {
      // bullets from enemies can hit player
      if ((b.x - player.x)**2 + (b.y - player.y)**2 < (b.radius + player.radius)**2) {
        player.health -= b.damage; b.alive = false;
        if (player.health <= 0) player.alive = false;
      }
    }
  }

  // enemies
  for (let i = enemies.length-1; i>=0; i--) {
    const e = enemies[i];
    e.update(dt, player, bullets);
    if ((e.x - player.x)**2 + (e.y - player.y)**2 < (e.radius + player.radius)**2) {
      if (e.attackTimer <= 1e-6) {
        player.health -= e.damage;
        e.attackTimer = e.attackCooldown;
        if (player.health <= 0) player.alive = false;
      }
    }
  }

  // shop handling
  shopTimer -= dt;
  if (shopTimer <= 0 && !shopOpen) { shopOpen = true; shopTimeLeft = SHOP_DURATION; shopTimer = SHOP_INTERVAL; }
  if (shopOpen) {
    shopTimeLeft -= dt;
    if (shopTimeLeft <= 0) shopOpen = false;
    else {
      if (Math.abs(shopTimeLeft - SHOP_DURATION) < 1e-5) {
        const r = openShopAndApply();
        if (r.ok) console.log("Agent bought", r.opt.name);
      }
    }
  }

  player.update(dt);
}

function clamp(v,a,b) { return Math.max(a, Math.min(b, v)); }

function render() {
  ctx.clearRect(0,0,W,H);
  // bullets
  for (const b of bullets) b.draw(ctx);
  // enemies
  for (const e of enemies) e.draw(ctx);
  // player
  player.draw(ctx);

  // HUD
  ctx.fillStyle = "#ddd"; ctx.font = "14px Arial";
  ctx.fillText(`Kills: ${player.kills}  Currency: ${player.currency}  Health: ${Math.floor(player.health)}/${Math.floor(player.maxHealth)}`, 10, 18);
  ctx.fillText(`Shop in: ${Math.floor(shopTimer)}s  Open:${shopOpen}  Agent best fitness:${Math.floor(agent.bestFitness)}  Sigma:${agent.sigma.toFixed(3)}`, 10, 36);
  hud.innerText = `Enemies: ${enemies.length}  Bullets: ${bullets.length}`;
}

let accum = 0;
function loop(now) {
  const dtReal = Math.min(0.04, (now - lastTime)/1000);
  lastTime = now;
  accum += dtReal;

  // run fixed-step updates at 60Hz; when training, also run additional headless episodes periodically
  while (accum >= 1/60) {
    // periodic ambient spawn
    if (Math.random() < 0.03) spawnAmbient();
    stepSimulation(1/60);
    episodeTime += 1/60;
    accum -= 1/60;
  }

  render();

  // if training is enabled, run short headless episodes in chunks to evolve weights
  if (training) {
    // Perform a brief headless episode run (accelerated)
    const res = runHeadlessEpisode(20.0); // returns fitness and a mutated candidate
    const {fitness, mutatedParams, savedParams} = res;
    const improved = (() => {
      // temporarily set candidate params to compute tryUpdateBest
      const old = agent.getParams();
      agent.setParams(mutatedParams);
      const did = agent.tryUpdateBest(fitness);
      if (!did) agent.setParams(savedParams);
      return did;
    })();
    if (!improved) agent.mutate(); // keep exploring
    player.applyState(agent.state);
    // small status update
    statusEl.textContent = `Status: training active, last fitness ${Math.floor(fitness)}`;
  }

  requestAnimationFrame(loop);
}

function runHeadlessEpisode(maxTime=30) {
  // copy agent params and mutate candidate, then simulate faster (no rendering)
  const savedParams = agent.getParams();
  const candidate = JSON.parse(JSON.stringify(savedParams));
  // mutate candidate arrays a bit
  // small helper to perturb nested arrays
  mutateParams(candidate, agent.sigma);

  // instantiate ephemeral entities
  const p = new Player(W/2, H/2, savedParams.state || {upgrades:{}});
  let bs = [], es = [];
  let t = 0, spawnTimer = 0;
  while (t < maxTime && p.alive) {
    const dt = 1/60;
    t += dt;
    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawnTimer = Math.max(0.25, 1.6 - t * 0.012); const cnt = randInt(1,2); for (let i=0;i<cnt;i++){ const side = randInt(0,3); let x,y; if (side===0){x=-30; y=Math.random()*H;} else if(side===1){x=W+30;y=Math.random()*H;} else if(side===2){x=Math.random()*W;y=-30;} else {x=Math.random()*W;y=H+30;} es.push(new Enemy(x,y, ["melee","ranged","fast"][randInt(0,2)])); } }
    // decision using candidate weights -> use a small forward pass
    const inputs = collectInputs(p, es);
    const inputArr = new Float32Array(14); for (let i=0;i<14;i++) inputArr[i] = inputs[i] || 0;
    const out = forwardWithParams(candidate, inputArr);
    let mx = Math.tanh(out[0]||0), my = Math.tanh(out[1]||0);
    const l = Math.hypot(mx,my); if (l>1e-6){mx/=l; my/=l;}
    p.x += mx * p.moveSpeed * dt; p.y += my * p.moveSpeed * dt;
    p.x = clamp(p.x, 0, W); p.y = clamp(p.y, 0, H);
    p.fireTimer = Math.max(0, p.fireTimer - dt);
    const shootProb = 1/(1+Math.exp(-(out[2]||0)));
    if (shootProb > 0.55 && p.fireTimer <= 1e-6) {
      if (es.length) { const en = es.reduce((a,b)=> ((a.x-p.x)**2+(a.y-p.y)**2) < ((b.x-p.x)**2+(b.y-p.y)**2) ? a : b); const dx = en.x-p.x, dy=en.y-p.y, dd=Math.hypot(dx,dy)+1e-6; const vx=dx/dd, vy=dy/dd; bs.push(new Bullet(p.x+vx*(p.radius+6), p.y+vy*(p.radius+6), vx, vy, p, p.damage, 420)); p.fireTimer = p.fireCooldown; }
    }
    // update bullets
    for (let i=bs.length-1;i>=0;i--) {
      const b = bs[i]; b.update(dt, {w:W,h:H}); if (!b.alive){bs.splice(i,1); continue;}
      if (b.owner===p) {
        for (let j=es.length-1;j>=0;j--) {
          const e = es[j];
          if ((b.x-e.x)**2+(b.y-e.y)**2 < (b.radius+e.radius)**2) {
            e.health -= b.damage; b.alive=false;
            if (e.health <= 0 && e.alive) { e.alive=false; es.splice(j,1); p.kills++; p.currency+=15;}
            break;
          }
        }
      }
    }
    // enemies
    for (let i=es.length-1;i>=0;i--) {
      const e = es[i]; e.update(dt, p, bs);
      if ((e.x-p.x)**2+(e.y-p.y)**2 < (e.radius+p.radius)**2) {
        if (e.attackTimer <= 1e-6) { p.health -= e.damage; e.attackTimer = e.attackCooldown; if (p.health <= 0) p.alive=false; }
      }
    }
    p.update(dt);
  }

  const fitness = p.kills * 50.0 + t * 1.0 + p.currency * 2.0 - (p.maxHealth - p.health) * 0.5;
  return { fitness, mutatedParams: candidate, savedParams };
}

// helpers for headless forward/mutate (operate on plain JSON param structure)
function forwardWithParams(params, x) {
  // W1: array of arrays, b1: array, W2: array of arrays, b2: array
  const hidden = new Float32Array(params.W1.length);
  for (let i=0;i<params.W1.length;i++) {
    let s = params.b1[i] || 0;
    for (let j=0;j<params.W1[i].length;j++) s += params.W1[i][j] * x[j];
    hidden[i] = Math.tanh(s);
  }
  const out = new Float32Array(params.W2.length);
  for (let i=0;i<params.W2.length;i++) {
    let s = params.b2[i] || 0;
    for (let j=0;j<params.W2[i].length;j++) s += params.W2[i][j] * hidden[j];
    out[i] = s;
  }
  return out;
}
function mutateParams(p, sigma) {
  for (let i=0;i<p.W1.length;i++) for (let j=0;j<p.W1[i].length;j++) p.W1[i][j] += gauss()*sigma;
  for (let i=0;i<p.b1.length;i++) p.b1[i] += gauss()*sigma;
  for (let i=0;i<p.W2.length;i++) for (let j=0;j<p.W2[i].length;j++) p.W2[i][j] += gauss()*sigma;
  for (let i=0;i<p.b2.length;i++) p.b2[i] += gauss()*sigma;
}
function forwardWithAgent(agentParams, x) { return forwardWithParams(agentParams, x); }

function gauss() {
  let u=0,v=0; while(u===0)u=Math.random(); while(v===0)v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}

function randInt(a,b) { return Math.floor(Math.random()*(b-a+1))+a; }
function clamp(v,a,b) { return Math.max(a, Math.min(b, v)); }

requestAnimationFrame(loop);
