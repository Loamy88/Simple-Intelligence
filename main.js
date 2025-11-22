// main.js - improved visuals, particles, shop overlay & retina scaling
import { NeuralAgent } from './ai.js';
import { Player, Enemy, Bullet } from './entities.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const hudEl = document.getElementById('hud');
const statusEl = document.getElementById('status');

let W = canvas.width, H = canvas.height;
let DPR = Math.max(1, window.devicePixelRatio || 1);

function resizeCanvas() {
  // keep logical size but scale for DPR
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.floor(rect.width);
  const cssH = Math.floor((canvas.height / canvas.width) * cssW);
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  W = canvas.width = cssW * DPR;
  H = canvas.height = cssH * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); // draw in CSS px space with DPR scaling
}
window.addEventListener('resize', () => { resizeCanvas(); });
resizeCanvas();

// game state
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
let player = new Player(480, 320, agent.state);
let bullets = [];
let enemies = [];
let particles = [];
let lastTime = performance.now();
let training = false;
let shopTimer = SHOP_INTERVAL;
let shopOpen = false;
let shopTimeLeft = 0;
let episodeTime = 0;
let mouse = {x: 480, y: 320};

// UI wiring
document.getElementById('btn-save').onclick = () => { agent.save(); statusEl.textContent = "Status: saved to localStorage"; };
document.getElementById('btn-load').onclick = () => { agent.loadIfExists(); player.applyState(agent.state); statusEl.textContent = "Status: loaded"; };
document.getElementById('btn-export').onclick = () => {
  const data = agent.exportJSON();
  const blob = new Blob([data], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download='agent.json'; a.click();
  URL.revokeObjectURL(url);
};
const inputFile = document.getElementById('file-import');
inputFile.onchange = (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { agent.importJSON(r.result); player.applyState(agent.state); statusEl.textContent = "Status: imported agent"; };
  r.readAsText(f);
};
document.getElementById('btn-toggle-train').onclick = () => { training = !training; statusEl.textContent = "Status: training=" + training; };

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (canvas.width / r.width) / DPR;
  mouse.y = (e.clientY - r.top) * (canvas.height / r.height) / DPR;
});
window.addEventListener('keydown', (e) => {
  if (e.key === '1' || e.key === '2' || e.key === '3') {
    const kind = (e.key === '1') ? 'melee' : (e.key === '2') ? 'ranged' : 'fast';
    const spawn = new Enemy(mouse.x, mouse.y, kind);
    spawn._spawnTime = performance.now(); // for scale animation
    enemies.push(spawn);
  }
  if (e.key === 's' || e.key === 'S') agent.save();
  if (e.key === 'l' || e.key === 'L') { agent.loadIfExists(); player.applyState(agent.state); }
  if (e.key === 't' || e.key === 'T') { training = !training; statusEl.textContent = "Status: training=" + training; }
});

// small helpers
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function randInt(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function gauss(){ let u=0,v=0; while(u===0)u=Math.random(); while(v===0)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }

// PARTICLES
function spawnParticles(x,y,color,count=16,spread=30,life=0.6){
  for(let i=0;i<count;i++){
    const ang = Math.random()*Math.PI*2;
    const sp = 0.3 + Math.random()*1.4;
    particles.push({
      x,y,
      vx: Math.cos(ang)*sp*spread,
      vy: Math.sin(ang)*sp*spread - 20*Math.random(),
      life: life*(0.6+Math.random()*0.8),
      age:0,
      color,
      size: 1.5 + Math.random()*2.8
    });
  }
}
function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){
    const p = particles[i];
    p.age += dt;
    if(p.age >= p.life){ particles.splice(i,1); continue; }
    p.vy += 200*dt; // gravity
    p.x += p.vx*dt;
    p.y += p.vy*dt;
    p.vx *= 1 - dt*2;
    p.vy *= 1 - dt*1.2;
  }
}
function drawParticles(ctx){
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for(const p of particles){
    const t = 1 - (p.age / p.life);
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * t, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

// improved rendering helpers
function drawGlowCircle(ctx, x,y,r, color, innerColor) {
  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = innerColor || color;
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(6, r*0.9);
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawHealthBar(ctx, x,y, radius, health, maxHealth){
  const w = 48, h = 6;
  const left = x - w/2, top = y - radius - 12;
  ctx.save();
  // background
  ctx.fillStyle = 'rgba(10,10,10,0.6)';
  roundRect(ctx, left-0.5, top-0.5, w+1, h+1, 3);
  ctx.fill();
  // filled
  const ratio = clamp(health/maxHealth, 0, 1);
  ctx.fillStyle = ratio > 0.5 ? '#5be06e' : (ratio > 0.25 ? '#ffd166' : '#ff6b6b');
  roundRect(ctx, left, top, w*ratio, h, 3);
  ctx.fill();
  ctx.restore();
}
function roundRect(ctx,x,y,w,h,r){
  const R = r||4;
  ctx.beginPath();
  ctx.moveTo(x+R,y);
  ctx.arcTo(x+w,y,x+w,y+h,R);
  ctx.arcTo(x+w,y+h,x,y+h,R);
  ctx.arcTo(x,y+h,x,y,R);
  ctx.arcTo(x,y,x+w,y,R);
  ctx.closePath();
}

// spawn ambient enemies
function spawnAmbient(){
  if (Math.random() < 0.85 && enemies.length < 18) {
    const side = Math.floor(Math.random()*4);
    let x,y;
    if (side === 0){ x = -20; y = Math.random()*H; }
    else if (side === 1){ x = W + 20; y = Math.random()*H; }
    else if (side === 2){ x = Math.random()*W; y = -20; }
    else { x = Math.random()*W; y = H + 20; }
    const k = Math.random() < 0.45 ? 'melee' : (Math.random() < 0.8 ? 'ranged' : 'fast');
    const e = new Enemy(x/DPR, y/DPR, k);
    e._spawnTime = performance.now();
    enemies.push(e);
  }
}

// collectInputs same as before (14 inputs)
function collectInputs(player, enemies){
  const inputs = [];
  inputs.push(player.health / Math.max(1, player.maxHealth));
  inputs.push(player.currency / 100.0);
  const sorted = enemies.slice().sort((a,b) => ((a.x-player.x)**2+(a.y-player.y)**2) - ((b.x-player.x)**2+(b.y-player.y)**2));
  for (let i=0;i<MAX_NEAREST;i++){
    if (i < sorted.length){
      const e = sorted[i];
      inputs.push((e.x - player.x) / (canvas.width/DPR));
      inputs.push((e.y - player.y) / (canvas.height/DPR));
      const d = Math.hypot((e.x-player.x)/(canvas.width/DPR), (e.y-player.y)/(canvas.height/DPR));
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
  while (inputs.length < 14) inputs.push(0);
  return inputs.slice(0,14);
}

// open shop but now we show visual overlay (shopOpen controls it)
function openShopAndApply() {
  const inputs = collectInputs(player, enemies);
  const decision = agent.decide(inputs);
  const val = decision.shopValue;
  let idx = Math.floor(((Math.tanh(val)+1)/2) * SHOP_OPTIONS.length);
  idx = clamp(idx,0,SHOP_OPTIONS.length-1);
  const opt = SHOP_OPTIONS[idx];
  if (player.currency >= opt.cost) {
    const up = agent.state.upgrades || {};
    up[opt.key] = (up[opt.key] || 0) + opt.amount;
    agent.state.upgrades = up;
    player.currency -= opt.cost;
    player.applyState(agent.state);
    // spawn subtle particles to celebrate purchase
    spawnParticles(player.x, player.y, '#7ef3b6', 22, 40, 0.8);
    return {ok:true, opt, idx};
  }
  return {ok:false, opt, idx};
}

// main update logic (similar to previous but with visual polish)
function stepSimulation(dt){
  // agent decision
  const inputs = collectInputs(player, enemies);
  const dec = agent.decide(inputs);
  let mx = dec.move[0], my = dec.move[1];
  const l = Math.hypot(mx,my);
  if (l > 1e-6) { mx /= l; my /= l; }
  player.x += mx * player.moveSpeed * dt;
  player.y += my * player.moveSpeed * dt;
  player.x = clamp(player.x, 0, canvas.width/DPR); player.y = clamp(player.y, 0, canvas.height/DPR);

  // shooting
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

  // bullets update
  for (let i = bullets.length-1; i>=0; i--){
    const b = bullets[i];
    b.update(dt);
    if (!b.alive) { bullets.splice(i,1); continue; }
    // collision bullets -> enemies
    if (b.owner === player){
      for (let j = enemies.length-1; j>=0; j--){
        const e = enemies[j];
        if ((b.x - e.x)**2 + (b.y - e.y)**2 < (b.radius+e.radius)**2){
          e.health -= b.damage;
          b.alive = false;
          spawnParticles(b.x, b.y, '#ffd83a', 6, 16, 0.35);
          if (e.health <= 0 && e.alive){
            e.alive = false;
            // death pop
            spawnParticles(e.x, e.y, '#ff9aa2', 22, 36, 0.9);
            enemies.splice(j,1);
            player.kills += 1;
            player.currency += 15;
          }
          break;
        }
      }
    } else {
      // enemy bullet hit player
      if ((b.x - player.x)**2 + (b.y - player.y)**2 < (b.radius + player.radius)**2){
        player.health -= b.damage;
        b.alive = false;
        spawnParticles(player.x, player.y, '#ff6b6b', 10, 30, 0.5);
        if (player.health <= 0) player.alive = false;
      }
    }
  }

  // enemies update
  for (let i = enemies.length-1; i>=0; i--){
    const e = enemies[i];
    e.update(dt, player, bullets);
    // melee collision damage
    if ((e.x - player.x)**2 + (e.y - player.y)**2 < (e.radius + player.radius)**2) {
      if (e.attackTimer <= 1e-6) {
        player.health -= e.damage;
        e.attackTimer = e.attackCooldown;
        spawnParticles(player.x + (Math.random()-0.5)*8, player.y + (Math.random()-0.5)*8, '#ff6b6b', 8, 20, 0.5);
        if (player.health <= 0) player.alive = false;
      }
    }
  }

  // shop timing
  shopTimer -= dt;
  if (shopTimer <= 0 && !shopOpen) {
    shopOpen = true;
    shopTimeLeft = SHOP_DURATION;
    shopTimer = SHOP_INTERVAL;
    // show overlay for SHOP_DURATION and attempt AI decision visually when it opens
    const r = openShopAndApply(); // will attempt purchase and create particles if bought
    shopOpen = true; // keep overlay while shopTimeLeft > 0
    // store result for overlay
    shopOverlayCache = r;
  }
  if (shopOpen) {
    shopTimeLeft -= dt;
    if (shopTimeLeft <= 0) shopOpen = false;
  }

  player.update(dt);
  updateParticles(dt);
}

// render
function render(){
  // clear
  ctx.clearRect(0,0,canvas.width/DPR, canvas.height/DPR);
  // subtle vignette background
  const g = ctx.createLinearGradient(0,0,0,canvas.height/DPR);
  g.addColorStop(0,'#0f1216'); g.addColorStop(1,'#0b0d11');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,canvas.width/DPR, canvas.height/DPR);

  // draw bullets with glow
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of bullets) {
    drawGlowCircle(ctx, b.x, b.y, b.radius*1.8, '#ffd83a', '#fff3bf');
  }
  ctx.restore();

  // draw enemies (with spawn scale and glow)
  for (const e of enemies) {
    const spawnAge = e._spawnTime ? (performance.now() - e._spawnTime)/300 : 1;
    const s = clamp(spawnAge, 0, 1);
    const scale = 0.6 + 0.4*s;
    const ex = e.x, ey = e.y, r = e.radius * scale;
    const color = e.color || '#dc5a5a';
    // shadowed core
    drawGlowCircle(ctx, ex, ey, r, color, color);
    // inner highlight
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.ellipse(ex - r*0.3, ey - r*0.45, r*0.35, r*0.25, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    drawHealthBar(ctx, ex, ey, r, e.health, 30);
  }

  // player with stronger glow and halo
  drawGlowCircle(ctx, player.x, player.y, player.radius, '#3cb4df', '#dff8ff');
  // player halo ring
  ctx.save();
  ctx.strokeStyle = 'rgba(60,180,220,0.14)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(player.x, player.y, player.radius+6, 0, Math.PI*2); ctx.stroke();
  ctx.restore();
  drawHealthBar(ctx, player.x, player.y, player.radius, player.health, player.maxHealth);

  // particles
  drawParticles(ctx);

  // shop overlay (draw on top)
  if (shopOpen && shopOverlayCache) {
    ctx.save();
    const w = 420, h = 120;
    const cx = (canvas.width/DPR)/2, cy = (canvas.height/DPR)/2;
    // dim
    ctx.fillStyle = 'rgba(6,7,9,0.55)';
    roundRect(ctx, cx - w/2 - 6, cy - h/2 - 6, w+12, h+12, 12);
    ctx.fill();

    // card
    ctx.fillStyle = 'rgba(18,20,24,0.95)';
    roundRect(ctx, cx - w/2, cy - h/2, w, h, 10);
    ctx.fill();

    // text
    ctx.fillStyle = '#dbeefb'; ctx.font = '600 16px Inter, Arial';
    ctx.fillText('Shop (AI deciding)...', cx - w/2 + 18, cy - h/2 + 28);

    // show chosen option
    const opt = shopOverlayCache.opt;
    const idx = shopOverlayCache.idx || 0;
    const ok = shopOverlayCache.ok;
    ctx.font = '14px Inter, Arial';
    ctx.fillStyle = ok ? '#b7ffde' : '#bdbdbd';
    ctx.fillText(`${ok ? 'Purchased:' : 'Considered:'} ${opt.name}  (cost: ${opt.cost})`, cx - w/2 + 18, cy - h/2 + 60);
    // progress/time left
    const tleft = Math.max(0, shopTimeLeft || 0);
    ctx.fillStyle = '#9fb6c6';
    ctx.fillText(`Shop closes in ${tleft.toFixed(1)}s`, cx - w/2 + 18, cy - h/2 + 90);
    ctx.restore();
  }

  // HUD (we reflect same info in HTML for accessibility)
  updateHUD();
}

let shopOverlayCache = null;
function updateHUD(){
  hudEl.innerText = `Enemies: ${enemies.length}   Bullets: ${bullets.length}   Kills: ${player.kills}   Currency: ${player.currency}`;
  // status line
  statusEl.textContent = `Agent best fitness: ${Math.floor(agent.bestFitness)}  Sigma: ${agent.sigma.toFixed(3)}  Training: ${training}`;
}

// main loop & training chunking
let accum = 0;
function loop(now){
  const dtReal = Math.min(0.04, (now - lastTime)/1000);
  lastTime = now;
  accum += dtReal;

  // fixed-step at 60Hz for stable simulation
  while (accum >= 1/60) {
    // ambient spawns
    if (Math.random() < 0.03) spawnAmbient();
    stepSimulation(1/60);
    episodeTime += 1/60;
    accum -= 1/60;
  }

  render();

  // occasional background training (keeps UI responsive)
  if (training && Math.random() < 0.02) {
    // perform a short accelerated headless episode and try to update agent
    const res = runHeadlessEpisode(14.0);
    const {fitness, mutatedParams, savedParams} = res;
    // try candidate
    const oldParams = agent.getParams();
    agent.setParams(mutatedParams);
    const improved = agent.tryUpdateBest(fitness);
    if (!improved) {
      agent.setParams(savedParams);
      agent.mutate();
    } else {
      // keep improved; apply to player state
      player.applyState(agent.state);
    }
    statusEl.textContent = `Training: last fitness ${Math.floor(fitness)}  best ${Math.floor(agent.bestFitness)}`;
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Headless episode (like before) but slightly optimized for the browser without DOM updates
function runHeadlessEpisode(maxTime=30){
  const savedParams = agent.getParams();
  const candidate = JSON.parse(JSON.stringify(savedParams));
  // mutate candidate slightly
  for (let i=0;i<candidate.W1.length;i++) for (let j=0;j<candidate.W1[i].length;j++) candidate.W1[i][j] += gauss()*candidate.sigma;
  for (let i=0;i<candidate.b1.length;i++) candidate.b1[i] += gauss()*candidate.sigma;
  for (let i=0;i<candidate.W2.length;i++) for (let j=0;j<candidate.W2[i].length;j++) candidate.W2[i][j] += gauss()*candidate.sigma;
  for (let i=0;i<candidate.b2.length;i++) candidate.b2[i] += gauss()*candidate.sigma;

  const p = new Player((canvas.width/DPR)/2, (canvas.height/DPR)/2, savedParams.state || {upgrades:{}});
  let bs = [], es = [];
  let t = 0, spawnTimer = 0;
  while (t < maxTime && p.alive) {
    const dt = 1/60; t += dt;
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = Math.max(0.25, 1.6 - t * 0.012);
      const cnt = randInt(1,2);
      for (let k=0;k<cnt;k++){
        const side = randInt(0,3);
        let x,y;
        if (side===0){ x = -30; y = Math.random()*(canvas.height/DPR); }
        else if (side===1){ x = (canvas.width/DPR)+30; y = Math.random()*(canvas.height/DPR); }
        else if (side===2){ x = Math.random()*(canvas.width/DPR); y = -30; }
        else { x = Math.random()*(canvas.width/DPR); y = (canvas.height/DPR)+30; }
        es.push(new Enemy(x, y, ['melee','ranged','fast'][randInt(0,2)]));
      }
    }
    // agent forward with candidate
    const inputs = collectInputs(p, es);
    const inputArr = new Float32Array(14); for (let i=0;i<14;i++) inputArr[i] = inputs[i] || 0;
    const out = forwardWithParams(candidate, inputArr);
    let mx = Math.tanh(out[0]||0), my = Math.tanh(out[1]||0);
    const l = Math.hypot(mx,my); if (l > 1e-6){ mx/=l; my/=l; }
    p.x += mx * p.moveSpeed * dt; p.y += my * p.moveSpeed * dt;
    p.x = clamp(p.x, 0, canvas.width/DPR); p.y = clamp(p.y, 0, canvas.height/DPR);
    p.fireTimer = Math.max(0, p.fireTimer - dt);
    const shootProb = 1/(1+Math.exp(-(out[2]||0)));
    if (shootProb > 0.55 && p.fireTimer <= 1e-6){
      if (es.length){
        const en = es.reduce((a,b)=> ((a.x-p.x)**2+(a.y-p.y)**2) < ((b.x-p.x)**2+(b.y-p.y)**2) ? a : b);
        const dx = en.x-p.x, dy = en.y-p.y, dd = Math.hypot(dx,dy)+1e-6;
        bs.push(new Bullet(p.x + (dx/dd)*(p.radius+6), p.y + (dy/dd)*(p.radius+6), dx/dd, dy/dd, p, p.damage, 420));
        p.fireTimer = p.fireCooldown;
      }
    }
    // bullets update simplified
    for (let i = bs.length-1; i>=0; i--){
      const b = bs[i]; b.update(dt);
      if (!b.alive){ bs.splice(i,1); continue; }
      if (b.owner === p){
        for (let j = es.length-1; j>=0; j--){
          const e = es[j];
          if ((b.x - e.x)**2 + (b.y - e.y)**2 < (b.radius+e.radius)**2){
            e.health -= b.damage; b.alive=false;
            if (e.health <= 0 && e.alive){ e.alive=false; es.splice(j,1); p.kills++; p.currency+=15; }
            break;
          }
        }
      }
    }
    // enemies
    for (let i = es.length-1; i>=0; i--){
      const e = es[i]; e.update(dt, p, bs);
      if ((e.x - p.x)**2 + (e.y - p.y)**2 < (e.radius + p.radius)**2){
        if (e.attackTimer <= 1e-6){ p.health -= e.damage; e.attackTimer = e.attackCooldown; if (p.health <= 0) p.alive=false; }
      }
    }
    p.update(dt);
  }

  const fitness = p.kills * 50.0 + t*1.0 + p.currency*2.0 - (p.maxHealth - p.health)*0.5;
  return { fitness, mutatedParams: candidate, savedParams };
}

// helpers for running forward using param JSON
function forwardWithParams(params, x){
  // W1: array of arrays, b1: array, W2: array of arrays, b2: array
  const hidden = new Float32Array(params.W1.length);
  for (let i=0;i<params.W1.length;i++){
    let s = params.b1[i] || 0;
    for (let j=0;j<params.W1[i].length;j++) s += params.W1[i][j] * x[j];
    hidden[i] = Math.tanh(s);
  }
  const out = new Float32Array(params.W2.length);
  for (let i=0;i<params.W2.length;i++){
    let s = params.b2[i] || 0;
    for (let j=0;j<params.W2[i].length;j++) s += params.W2[i][j] * hidden[j];
    out[i] = s;
  }
  return out;
}
