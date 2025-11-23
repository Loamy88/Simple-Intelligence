// main.js - client-side changes: points over time, "select type then place" spawn flow, and GitHub save POST
// Replace or merge into your existing client main.js. Make sure ai.js and entities.js remain present.

import { NeuralAgent } from './ai.js';
import { Player, Enemy, Bullet } from './entities.js';

// --- CONFIG ---
// Endpoint of your serverless save endpoint (you will deploy this separately)
// Example: https://your-netlify-site.netlify.app/.netlify/functions/save-ai
const SAVE_ENDPOINT = 'https://YOUR_SAVE_ENDPOINT_HERE'; // <-- set this after deploying serverless function

const REPO_RAW_LOAD_URL = 'https://raw.githubusercontent.com/Loamy88/Simple-Intelligence/main/ai_weights.json'; // raw URL to load saved weights (public repo)

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const aiStatsEl = document.getElementById('ai-stats');
const playerPointsEl = document.getElementById('player-points');

let DPR = Math.max(1, window.devicePixelRatio || 1);
function resizeCanvas(){ const rect = canvas.getBoundingClientRect(); canvas.width = Math.floor(rect.width * DPR) || 960; canvas.height = Math.floor(rect.height * DPR) || 640; ctx.setTransform(DPR,0,0,DPR,0,0); }
canvas.style.width='720px'; canvas.style.height='480px'; resizeCanvas(); window.addEventListener('resize', resizeCanvas);

// --- Game state / agent ---
const INPUT_SIZE = 14;
let agent = new NeuralAgent({ inputSize: INPUT_SIZE, hiddenSize: 48, outputSize: 5, sigma: 0.12 });
let aiPlayer = new Player((canvas.width/DPR)/2, (canvas.height/DPR)/2, agent.state);
let bullets = [], enemies = [];

let playerPoints = 100;
const POINTS_PER_SECOND = 6; // player earns 6 points/sec (tune as you like)
let selectedSpawnType = null; // when user clicks spawn button, it sets this; clicking canvas places it

// spawn costs
const SPAWN_COSTS = { melee: 20, ranged: 30, fast: 25 };

// UI wiring for spawn selection (buttons in your HTML must have data-spawn attribute)
document.querySelectorAll('.spawn-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const kind = btn.dataset.spawn;
    selectedSpawnType = kind;
    statusEl.textContent = `Selected spawn type: ${kind}. Click on canvas to place (cost ${SPAWN_COSTS[kind]}).`;
  });
});

// Place enemy on canvas when clicking (if in play mode and selectedSpawnType set)
canvas.addEventListener('click', (e) => {
  if (!selectedSpawnType) return; // nothing selected
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width) / DPR;
  const my = (e.clientY - rect.top) * (canvas.height / rect.height) / DPR;
  const cost = SPAWN_COSTS[selectedSpawnType] || 20;
  if (playerPoints >= cost) {
    enemies.push(new Enemy(mx, my, selectedSpawnType));
    playerPoints -= cost;
    selectedSpawnType = null;
    statusEl.textContent = `Spawn placed. Points left: ${playerPoints}`;
    updateUI();
  } else {
    statusEl.textContent = 'Not enough points to place that enemy.';
  }
});

// points accrual over time
let pointsAccumulator = 0; // seconds worth
function accruePoints(dt) {
  pointsAccumulator += dt;
  if (pointsAccumulator >= 1.0) {
    const whole = Math.floor(pointsAccumulator);
    playerPoints += whole * POINTS_PER_SECOND;
    pointsAccumulator -= whole;
    updateUI();
  }
}

// Save weights locally and also attempt to persist to GitHub via your serverless endpoint
async function saveAgentAndPushToGitHub() {
  try {
    // local save (existing behavior)
    agent.save(); // still saves to localStorage
    statusEl.textContent = 'Saved agent locally.';
  } catch(e) {
    console.warn('Local save failed', e);
  }

  // export weights JSON
  try {
    const payload = agent.exportJSON(); // stringified JSON
    if (!SAVE_ENDPOINT || SAVE_ENDPOINT.includes('YOUR_SAVE_ENDPOINT_HERE')) {
      console.warn('SAVE_ENDPOINT not set; skipping push to GitHub.');
      statusEl.textContent = 'Local save ok. Server save not configured.';
      return;
    }

    // POST to serverless function
    const resp = await fetch(SAVE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'ai_weights.json', // file path in repo (change if you want)
        content: payload,
        message: 'Update AI weights from web client'
      })
    });

    const j = await resp.json();
    if (!resp.ok) {
      statusEl.textContent = `Server save failed: ${j.message || resp.statusText}`;
      console.warn('Save to server failed', j);
    } else {
      statusEl.textContent = 'Saved to GitHub repo via server function.';
    }
  } catch (err) {
    console.error('Push to repo failed', err);
    statusEl.textContent = 'Push to repo failed (check server).';
  }
}

// Also support loading weights from repository raw URL (public repo)
async function loadWeightsFromRepo() {
  try {
    const r = await fetch(REPO_RAW_LOAD_URL + '?t=' + Date.now());
    if (!r.ok) { statusEl.textContent = 'No remote weights found.'; return; }
    const txt = await r.text();
    // The raw file must contain JSON with W1/W2/b1/b2 etc (same format as agent.getParams())
    agent.importJSON(txt);
    agent.loadIfExists(); // ensure internal state updated
    aiPlayer.applyState(agent.state);
    statusEl.textContent = 'Loaded weights from GitHub raw file.';
    updateUI();
  } catch (e) {
    console.warn('Load from repo failed', e);
    statusEl.textContent = 'Load failed.';
  }
}

// Hook save button in UI
document.getElementById('save-ai').addEventListener('click', () => {
  saveAgentAndPushToGitHub();
});
document.getElementById('load-ai').addEventListener('click', () => {
  loadWeightsFromRepo();
});

// --- Game loop basics (keeps AI alive/dying logic as before) ---
let last = performance.now();
function gameTick(now) {
  const dt = Math.min(1/30, (now - last) / 1000);
  last = now;

  // accumulate player points over time
  accruePoints(dt);

  // update AI & simulation (simplified version)
  // Only run AI behavior when in Play mode and not paused (you control run state elsewhere)
  // For simplicity we assume always running in this snippet
  if (aiPlayer.alive) {
    // agent decides
    const inputs = collectInputs(aiPlayer, enemies); // reuse your existing collectInputs implementation
    if (inputs.length >= agent.input_size || true) { // just call agent.decide
      const decision = agent.decide(inputs);
      // movement & shoot
      let mx = decision.move[0], my = decision.move[1];
      const l = Math.hypot(mx, my);
      if (l > 1e-6) { mx /= l; my /= l; }
      aiPlayer.x += mx * aiPlayer.moveSpeed * dt;
      aiPlayer.y += my * aiPlayer.moveSpeed * dt;
      // shooting
      aiPlayer.fireTimer = Math.max(0, aiPlayer.fireTimer - dt);
      if (decision.shootProb > 0.55 && aiPlayer.fireTimer <= 1e-6 && enemies.length) {
        const en = enemies.reduce((a,b)=> ((a.x-aiPlayer.x)**2+(a.y-aiPlayer.y)**2) < ((b.x-aiPlayer.x)**2+(b.y-aiPlayer.y)**2) ? a : b);
        aiPlayer.fireAt(en.x, en.y, bullets, { w: canvas.width / DPR, h: canvas.height / DPR});
      }
    }
  }

  // bullets update
  const bounds = { w: canvas.width / DPR, h: canvas.height / DPR };
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.update(dt, bounds);
    if (!b.alive) { bullets.splice(i,1); continue; }
    if (b.owner === aiPlayer) {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if ((b.x - e.x)**2 + (b.y - e.y)**2 < (b.radius + e.radius)**2) {
          e.health -= b.damage; b.pierce -= 1;
          if (b.pierce <= 0) b.alive = false;
          if (e.health <= 0) { enemies.splice(j,1); aiPlayer.kills++; aiPlayer.currency += 15; agent.state.gold = (agent.state.gold || 0) + 15; }
          break;
        }
      }
    } else {
      // enemy bullet -> maybe hits AI
      if ((b.x - aiPlayer.x)**2 + (b.y - aiPlayer.y)**2 < (b.radius + aiPlayer.radius)**2) {
        aiPlayer.health -= b.damage; b.alive = false; if (aiPlayer.health <= 0) aiPlayer.alive = false;
      }
    }
  }

  // enemies update
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.update(dt, aiPlayer, bullets);
    if ((e.x - aiPlayer.x)**2 + (e.y - aiPlayer.y)**2 < (e.radius + aiPlayer.radius)**2) {
      if (e.attackTimer <= 1e-6) {
        aiPlayer.health -= e.damage; e.attackTimer = e.attackCooldown;
        if (aiPlayer.health <= 0) aiPlayer.alive = false;
      }
    }
  }

  // Detect AI death, show popup and restart handled elsewhere (your modal code)
  if (!aiPlayer.alive) {
    // show modal / restart (your existing code)
    // ensure agent changes persist locally before modal
    agent.save();
  }

  // render - keep your rendering function
  renderFrame();

  requestAnimationFrame(gameTick);
}
requestAnimationFrame(gameTick);

// small helpers to keep UI updated
function updateUI(){
  playerPointsEl.textContent = playerPoints;
  aiStatsEl.innerText = `AI upgrades: ${JSON.stringify(agent.state.upgrades || {})}\nGold: ${agent.state.gold || 0}`;
}

// stub: reuse or import real collectInputs from your code if it's elsewhere
function collectInputs(player, enemies) {
  // Minimal reimplementation: health ratio + currency + up to 3 nearest enemies
  const inputs = [];
  inputs.push(player.health / Math.max(1, player.maxHealth));
  inputs.push(player.currency / 100.0);
  const sorted = enemies.slice().sort((a,b)=>((a.x-player.x)**2+(a.y-player.y)**2)-((b.x-player.x)**2+(b.y-player.y)**2));
  for (let i=0;i<3;i++){
    if (i < sorted.length){
      const e = sorted[i];
      inputs.push((e.x-player.x)/(canvas.width/DPR));
      inputs.push((e.y-player.y)/(canvas.height/DPR));
      const d = Math.hypot((e.x-player.x)/(canvas.width/DPR),(e.y-player.y)/(canvas.height/DPR));
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
  while (inputs.length < INPUT_SIZE) inputs.push(0);
  return inputs.slice(0, INPUT_SIZE);
}

// renderFrame() should draw aiPlayer, enemies, bullets, HUD - implement or reuse your rendering function
function renderFrame() {
  const W = canvas.width / DPR, H = canvas.height / DPR;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#071018';
  ctx.fillRect(0,0,W,H);
  for (const e of enemies) e.draw(ctx);
  for (const b of bullets) b.draw(ctx);
  aiPlayer.draw(ctx);
  // HUD
  ctx.fillStyle = '#fff';
  ctx.fillText(`Points: ${playerPoints}`, 10, 18);
  ctx.fillText(`AI kills: ${aiPlayer.kills} gold:${agent.state.gold||0}`, 10, 36);
}

// --- end of main.js ---
