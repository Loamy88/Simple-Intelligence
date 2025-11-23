// main.js - fixed single-file main for Auto-Training & Play vs AI
import { NeuralAgent } from './ai.js';
import { Player, Enemy, Bullet } from './entities.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const trainStatsEl = document.getElementById('train-stats');
const aiStatsEl = document.getElementById('ai-stats');
const playerPointsEl = document.getElementById('player-points');

let DPR = Math.max(1, window.devicePixelRatio || 1);
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * DPR) || 960;
  canvas.height = Math.floor(rect.height * DPR) || 640;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
canvas.style.width = '720px';
canvas.style.height = '480px';
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// modes
const MODE_TRAIN = 'train';
const MODE_PLAY = 'play';
let mode = MODE_TRAIN;

// agent & game state
const INPUT_SIZE = 14;
let agent = new NeuralAgent({ inputSize: INPUT_SIZE, hiddenSize: 48, outputSize: 5, sigma: 0.12 });

let aiPlayer = new Player(360, 240, agent.state); // AI-controlled entity used both in training & play
let bullets = [];
let enemies = [];
let particles = [];

let running = false; // for play mode run simulation
let trainingActive = false; // background auto-train
let trainerRunning = false;

let playerPoints = 100; // points the human may spend to spawn enemies in Play mode

const SHOP_OPTIONS = [
  { name: "Max Health +20", key: "max_health", amount: 20, cost: 30, value: 20, repeatable: true, priority: 1.0 },
  { name: "Damage +6", key: "damage", amount: 6, cost: 40, value: 6, repeatable: true, priority: 1.2 },
  { name: "Speed +20", key: "speed", amount: 20, cost: 35, value: 20, repeatable: true, priority: 1.0 },
  { name: "Fire Rate +1", key: "firerate", amount: 1, cost: 45, value: 1, repeatable: true, priority: 1.1 },
  { name: "Multi-Shot +1", key: "multishot", amount: 1, cost: 60, value: 1, repeatable: true, priority: 1.6 },
  { name: "Pierce +1", key: "pierce", amount: 1, cost: 55, value: 1, repeatable: true, priority: 1.3 },
  { name: "Heal Charge +1", key: "heal", amount: 1, cost: 50, value: 1, repeatable: true, priority: 1.0 }
];

// UI wiring
document.getElementById('mode-train').addEventListener('click', () => switchMode(MODE_TRAIN));
document.getElementById('mode-play').addEventListener('click', () => switchMode(MODE_PLAY));

document.getElementById('toggle-training').addEventListener('click', toggleTraining);
document.getElementById('save-ai').addEventListener('click', () => { agent.save(); statusEl.textContent = 'Saved AI'; });
document.getElementById('load-ai').addEventListener('click', () => { agent.loadIfExists(); aiPlayer.applyState(agent.state); statusEl.textContent = 'Loaded AI'; });
document.getElementById('export-ai').addEventListener('click', () => {
  const data = agent.exportJSON();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'agent.json'; a.click(); URL.revokeObjectURL(url);
});
document.getElementById('import-ai').addEventListener('click', () => document.getElementById('import-file').click());
document.getElementById('import-file').addEventListener('change', (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { agent.importJSON(r.result); aiPlayer.applyState(agent.state); statusEl.textContent = 'Imported AI'; };
  r.readAsText(f);
});

// play mode spawn buttons
document.querySelectorAll('.spawn-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const kind = btn.dataset.spawn;
    const cost = (kind === 'melee') ? 20 : (kind === 'ranged') ? 30 : 25;
    if (mode !== MODE_PLAY) return;
    if (playerPoints >= cost) {
      // spawn near center randomly
      const spawnX = (canvas.width / DPR) / 2 + (Math.random()-0.5)*120;
      const spawnY = (canvas.height / DPR) / 2 + (Math.random()-0.5)*120;
      enemies.push(new Enemy(spawnX, spawnY, kind));
      playerPoints -= cost;
      updateUI();
    } else {
      statusEl.textContent = 'Not enough points';
    }
  });
});

document.getElementById('start-run').addEventListener('click', () => { running = true; document.getElementById('start-run').disabled = true; document.getElementById('pause-run').disabled = false; statusEl.textContent = 'Run started'; });
document.getElementById('pause-run').addEventListener('click', () => { running = false; document.getElementById('start-run').disabled = false; document.getElementById('pause-run').disabled = true; statusEl.textContent = 'Paused'; });
document.getElementById('reset-run').addEventListener('click', () => { resetPlayRun(); });

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (canvas.width / r.width) / DPR;
  mouse.y = (e.clientY - r.top) * (canvas.height / r.height) / DPR;
});
canvas.addEventListener('click', (e) => {
  if (mode !== MODE_PLAY) return;
  if (playerPoints >= 20) {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width / r.width) / DPR;
    const my = (e.clientY - r.top) * (canvas.height / r.height) / DPR;
    enemies.push(new Enemy(mx, my, 'melee'));
    playerPoints -= 20;
    updateUI();
  }
});

let mouse = { x: canvas.width / DPR / 2, y: canvas.height / DPR / 2 };

// switch mode UI
function switchMode(m) {
  mode = m;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  if (m === MODE_TRAIN) document.getElementById('mode-train').classList.add('active');
  else document.getElementById('mode-play').classList.add('active');

  document.getElementById('training-controls').style.display = (m === MODE_TRAIN) ? 'block' : 'none';
  document.getElementById('play-controls').style.display = (m === MODE_PLAY) ? 'block' : 'none';

  if (m === MODE_PLAY) {
    agent.loadIfExists();
    aiPlayer = new Player((canvas.width / DPR) / 2, (canvas.height / DPR) / 2, agent.state);
    bullets = []; enemies = []; running = false;
    playerPoints = 100;
    updateUI();
    statusEl.textContent = 'Play mode loaded AI weights (paused)';
  } else {
    statusEl.textContent = 'Auto Train mode';
  }
}

// toggle training loop
function toggleTraining() {
  trainingActive = !trainingActive;
  document.getElementById('toggle-training').textContent = trainingActive ? 'Stop Auto-Training' : 'Start Auto-Training';
  statusEl.textContent = trainingActive ? 'Training started' : 'Training stopped';
  if (trainingActive) startHeadlessTrainer(); else stopHeadlessTrainer();
}

// headless trainer loop
function startHeadlessTrainer() {
  if (trainerRunning) return;
  trainerRunning = true;
  (async function loop() {
    while (trainerRunning) {
      const startTime = performance.now();
      const savedParams = agent.getParams();
      const candidate = JSON.parse(JSON.stringify(savedParams));
      // mutate candidate
      for (let i = 0; i < candidate.W1.length; i++) for (let j = 0; j < candidate.W1[i].length; j++) candidate.W1[i][j] += gauss() * candidate.sigma;
      for (let i = 0; i < candidate.b1.length; i++) candidate.b1[i] += gauss() * candidate.sigma;
      for (let i = 0; i < candidate.W2.length; i++) for (let j = 0; j < candidate.W2[i].length; j++) candidate.W2[i][j] += gauss() * candidate.sigma;
      for (let i = 0; i < candidate.b2.length; i++) candidate.b2[i] += gauss() * candidate.sigma;

      const res = runHeadlessEpisode(candidate, 10.0);
      const fitness = res.fitness;

      const improved = (() => {
        agent.setParams(candidate);
        return agent.tryUpdateBest(fitness);
      })();

      if (!improved) {
        agent.setParams(savedParams);
        agent.mutate();
      } else {
        agent.save();
      }

      const dur = Math.round(performance.now() - startTime);
      trainStatsEl.textContent = `Last fitness ${Math.floor(fitness)}  best ${Math.floor(agent.bestFitness)}  iter ${dur}ms  sigma ${agent.sigma.toFixed(3)}`;
      updateAIStats();
      await new Promise((r) => setTimeout(r, 12));
    }
  })();
}
function stopHeadlessTrainer() { trainerRunning = false; }

// runHeadlessEpisode - single, consolidated definition
function runHeadlessEpisode(candidateParams, maxTime = 20) {
  const bounds = { w: canvas.width / DPR, h: canvas.height / DPR };
  const p = new Player(bounds.w / 2, bounds.h / 2, candidateParams.state || { upgrades: {} });
  let bs = [], es = [];
  let t = 0, spawnTimer = 0;
  candidateParams.state = candidateParams.state || { upgrades: {}, gold: candidateParams.state?.gold || 0 };

  while (t < maxTime && p.alive) {
    const dt = 1 / 60; t += dt;
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = Math.max(0.25, 1.2 - t * 0.01);
      const cnt = (Math.random() < 0.5) ? 1 : 2;
      for (let k = 0; k < cnt; k++) {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0) { x = -30; y = Math.random() * bounds.h; }
        else if (side === 1) { x = bounds.w + 30; y = Math.random() * bounds.h; }
        else if (side === 2) { x = Math.random() * bounds.w; y = -30; }
        else { x = Math.random() * bounds.w; y = bounds.h + 30; }
        es.push(new Enemy(x, y, (Math.random() < 0.45) ? 'melee' : (Math.random() < 0.8 ? 'ranged' : 'fast')));
      }
    }

    // candidate decision
    const inputs = collectInputs(p, es);
    const out = forwardWithParams(candidateParams, new Float32Array(inputs));
    const mx = Math.tanh(out[0] || 0);
    const my = Math.tanh(out[1] || 0);
    const norm = Math.hypot(mx, my);
    const nx = norm > 1e-6 ? mx / norm : 0;
    const ny = norm > 1e-6 ? my / norm : 0;
    p.x += nx * p.moveSpeed * dt;
    p.y += ny * p.moveSpeed * dt;
    p.x = clamp(p.x, 0, bounds.w); p.y = clamp(p.y, 0, bounds.h);

    p.fireTimer = Math.max(0, p.fireTimer - dt);
    const shootProb = 1 / (1 + Math.exp(-(out[2] || 0)));
    if (shootProb > 0.55 && p.fireTimer <= 1e-6 && es.length) {
      const en = nearest(p, es);
      p.fireAt(en.x, en.y, bs, bounds);
    }

    // bullets processing
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      b.update(dt, bounds);
      if (!b.alive) { bs.splice(i, 1); continue; }
      if (b.owner === p) {
        for (let j = es.length - 1; j >= 0; j--) {
          const e = es[j];
          if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < (b.radius + e.radius) ** 2) {
            e.health -= b.damage; b.pierce -= 1;
            if (b.pierce <= 0) b.alive = false;
            if (e.health <= 0 && e.alive) { e.alive = false; es.splice(j, 1); p.kills++; p.currency += 15; candidateParams.state.gold = (candidateParams.state.gold || 0) + 15; }
            break;
          }
        }
      } else {
        if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (b.radius + p.radius) ** 2) {
          p.health -= b.damage; b.alive = false; if (p.health <= 0) p.alive = false;
        }
      }
    }

    for (let i = es.length - 1; i >= 0; i--) {
      const e = es[i]; e.update(dt, p, bs);
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (e.radius + p.radius) ** 2) {
        if (e.attackTimer <= 1e-6) { p.health -= e.damage; e.attackTimer = e.attackCooldown; if (p.health <= 0) p.alive = false; }
      }
    }

    // allow purchases
    if ((candidateParams.state.gold || 0) >= Math.min(...SHOP_OPTIONS.map(o => o.cost))) {
      performAgentShopPurchase(candidateParams, SHOP_OPTIONS);
    }

    // heal usage
    if (p.health < p.maxHealth * 0.45 && ((candidateParams.state.upgrades && candidateParams.state.upgrades.heal) || p.healAvailable)) {
      if (!p.useHeal()) {
        if ((candidateParams.state.upgrades || {}).heal > 0) {
          candidateParams.state.upgrades.heal -= 1; p.healAvailable += 1; p.useHeal();
        }
      }
    }

    p.update(dt);
  }

  const fitness = p.kills * 50.0 + t * 1.0 + p.currency * 2.0 - (p.maxHealth - p.health) * 0.5;
  return { fitness, kills: p.kills, time: t };
}

// performAgentShopPurchase: mapped to candidate params
function performAgentShopPurchase(params, options) {
  const inputs = [1.0, (params.state.gold || 0) / 200.0];
  while (inputs.length < INPUT_SIZE) inputs.push(0);
  const out = forwardWithParams(params, new Float32Array(inputs));
  let shopVal = out[3] || 0;
  let idx = Math.floor(((Math.tanh(shopVal) + 1) / 2) * options.length);
  idx = clamp(idx, 0, options.length - 1);
  const choice = options[idx];
  while ((params.state.gold || 0) >= choice.cost) {
    params.state.gold -= choice.cost;
    params.state.upgrades = params.state.upgrades || {};
    params.state.upgrades[choice.key] = (params.state.upgrades[choice.key] || 0) + choice.amount;
  }
}

// forwardWithParams helper (single place)
function forwardWithParams(params, xarr) {
  const W1 = params.W1, b1 = params.b1, W2 = params.W2, b2 = params.b2;
  const hidden = new Float32Array(W1.length);
  for (let i = 0; i < W1.length; i++) {
    let s = b1[i] || 0;
    for (let j = 0; j < W1[i].length; j++) s += W1[i][j] * xarr[j];
    hidden[i] = Math.tanh(s);
  }
  const out = new Float32Array(W2.length);
  for (let i = 0; i < W2.length; i++) {
    let s = b2[i] || 0;
    for (let j = 0; j < W2[i].length; j++) s += W2[i][j] * hidden[j];
    out[i] = s;
  }
  return out;
}

// Play step
function stepPlay(dt) {
  const inputs = collectInputs(aiPlayer, enemies);
  const decision = agent.decide(inputs);
  let mx = decision.move[0], my = decision.move[1];
  const l = Math.hypot(mx, my);
  if (l > 1e-6) { mx /= l; my /= l; }
  aiPlayer.x += mx * aiPlayer.moveSpeed * dt;
  aiPlayer.y += my * aiPlayer.moveSpeed * dt;
  aiPlayer.x = clamp(aiPlayer.x, 0, canvas.width / DPR); aiPlayer.y = clamp(aiPlayer.y, 0, canvas.height / DPR);

  aiPlayer.fireTimer = Math.max(0, aiPlayer.fireTimer - dt);
  if (decision.shootProb > 0.55 && aiPlayer.fireTimer <= 1e-6 && enemies.length) {
    const en = nearest(aiPlayer, enemies);
    aiPlayer.fireAt(en.x, en.y, bullets, { w: canvas.width / DPR, h: canvas.height / DPR });
  }

  const bounds = { w: canvas.width / DPR, h: canvas.height / DPR };
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.update(dt, bounds);
    if (!b.alive) { bullets.splice(i, 1); continue; }
    if (b.owner === aiPlayer) {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < (b.radius + e.radius) ** 2) {
          e.health -= b.damage;
          b.pierce -= 1;
          if (b.pierce <= 0) b.alive = false;
          if (e.health <= 0 && e.alive) { e.alive = false; enemies.splice(j, 1); aiPlayer.kills++; aiPlayer.currency += 15; agent.state.gold = (agent.state.gold || 0) + 15; }
          break;
        }
      }
    } else {
      if ((b.x - aiPlayer.x) ** 2 + (b.y - aiPlayer.y) ** 2 < (b.radius + aiPlayer.radius) ** 2) {
        aiPlayer.health -= b.damage; b.alive = false; if (aiPlayer.health <= 0) aiPlayer.alive = false;
      }
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.update(dt, aiPlayer, bullets);
    if ((e.x - aiPlayer.x) ** 2 + (e.y - aiPlayer.y) ** 2 < (e.radius + aiPlayer.radius) ** 2) {
      if (e.attackTimer <= 1e-6) { aiPlayer.health -= e.damage; e.attackTimer = e.attackCooldown; if (aiPlayer.health <= 0) aiPlayer.alive = false; }
    }
  }

  if ((agent.state.gold || 0) >= Math.min(...SHOP_OPTIONS.map(o => o.cost))) {
    const bought = agent.shopBuyLoop(JSON.parse(JSON.stringify(SHOP_OPTIONS)));
    if (bought.length > 0) {
      aiPlayer.applyState(agent.state);
      agent.save();
    }
  }

  if (aiPlayer.health < aiPlayer.maxHealth * 0.45) aiPlayer.useHeal();
  aiPlayer.update(dt);
}

// helpers & UI
function resetPlayRun() {
  aiPlayer = new Player((canvas.width / DPR) / 2, (canvas.height / DPR) / 2, agent.state);
  bullets = []; enemies = []; running = false; playerPoints = 100;
  document.getElementById('start-run').disabled = false;
  document.getElementById('pause-run').disabled = true;
  updateUI();
}

function spawnAmbient() {
  if (Math.random() < 0.02 && enemies.length < 18) {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = -20; y = Math.random() * (canvas.height / DPR); }
    else if (side === 1) { x = (canvas.width / DPR) + 20; y = Math.random() * (canvas.height / DPR); }
    else if (side === 2) { x = Math.random() * (canvas.width / DPR); y = -20; }
    else { x = Math.random() * (canvas.width / DPR); y = (canvas.height / DPR) + 20; }
    enemies.push(new Enemy(x, y, (Math.random() < 0.45) ? 'melee' : (Math.random() < 0.8 ? 'ranged' : 'fast')));
  }
}

function render() {
  const W = canvas.width / DPR, H = canvas.height / DPR;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#071018';
  ctx.fillRect(0, 0, W, H);

  for (const e of enemies) e.draw(ctx);
  for (const b of bullets) b.draw(ctx);
  aiPlayer.draw(ctx);

  ctx.fillStyle = '#cfeff8';
  ctx.font = '14px Inter, Arial';
  ctx.fillText(`Mode: ${mode}  AI best fitness: ${Math.floor(agent.bestFitness)}`, 10, 18);
  ctx.fillText(`AI gold: ${agent.state.gold || 0}  AI kills: ${aiPlayer.kills}`, 10, 36);

  if (mode === MODE_PLAY && !running) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(W/2 - 140, H/2 - 50, 280, 100);
    ctx.fillStyle = '#fff';
    ctx.font = '16px Inter, Arial';
    ctx.fillText('Play Run Paused', W/2 - 54, H/2 - 18);
    ctx.fillStyle = '#c4dfe7';
    ctx.font = '13px Inter, Arial';
    ctx.fillText('Spawn enemies with the panel or click canvas (20 points each)', W/2 - 180, H/2 + 4);
  }
}

function updateUI() {
  document.getElementById('player-points').textContent = playerPoints;
  aiStatsEl.innerText = `Upgrades: ${JSON.stringify(agent.state.upgrades || {})}\nGold: ${agent.state.gold || 0}`;
}

// main tick
let last = performance.now();
function tick(now) {
  const dt = Math.min(1/30, (now - last) / 1000);
  last = now;

  if (mode === MODE_TRAIN) {
    spawnAmbient();
    if (Math.random() < 0.5) for (const e of enemies) e.update(dt, aiPlayer, bullets);
  } else if (mode === MODE_PLAY) {
    if (running) stepPlay(dt);
  }

  render();
  updateUI();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// helpers reused
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function nearest(p, arr) { if (arr.length === 0) return { x: p.x + 1, y: p.y }; return arr.reduce((a, b) => ((a.x - p.x) ** 2 + (a.y - p.y) ** 2) < ((b.x - p.x) ** 2 + (b.y - p.y) ** 2) ? a : b); }
function collectInputs(player, enemies) {
  const inputs = [];
  inputs.push(player.health / Math.max(1, player.maxHealth));
  inputs.push(player.currency / 200.0);
  const sorted = enemies.slice().sort((a, b) => ((a.x - player.x) ** 2 + (a.y - player.y) ** 2) - ((b.x - player.x) ** 2 + (b.y - player.y) ** 2));
  for (let i = 0; i < 3; i++) {
    if (i < sorted.length) {
      const e = sorted[i];
      inputs.push((e.x - player.x) / (canvas.width / DPR));
      inputs.push((e.y - player.y) / (canvas.height / DPR));
      const d = Math.hypot((e.x - player.x) / (canvas.width / DPR), (e.y - player.y) / (canvas.height / DPR));
      inputs.push(d);
      let kind_code = 0;
      if (e.kind === 'melee') kind_code = 0.0;
      else if (e.kind === 'ranged') kind_code = 0.5;
      else if (e.kind === 'fast') kind_code = 1.0;
      inputs.push(kind_code);
    } else {
      inputs.push(0, 0, 0, 0);
    }
  }
  while (inputs.length < INPUT_SIZE) inputs.push(0);
  return inputs.slice(0, INPUT_SIZE);
}

function gauss() { let u=0,v=0; while(u===0)u=Math.random(); while(v===0)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }

function updateAIStats() { const s = agent.state || {}; aiStatsEl.innerText = `Upgrades: ${JSON.stringify(s.upgrades || {})}\nGold: ${s.gold || 0}`; }

// initialize
switchMode(MODE_TRAIN);
updateUI();
