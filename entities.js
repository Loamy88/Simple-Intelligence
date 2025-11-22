// entities.js - Player, Enemy, Bullet
export class Bullet {
  constructor(x, y, vx, vy, owner, dmg = 10, speed = 420) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.owner = owner;
    this.damage = dmg; this.speed = speed;
    this.radius = 4; this.alive = true;
  }
  update(dt, bounds) {
    this.x += this.vx * this.speed * dt;
    this.y += this.vy * this.speed * dt;
    if (this.x < -50 || this.x > bounds.w + 50 || this.y < -50 || this.y > bounds.h + 50) this.alive = false;
  }
  draw(ctx) {
    ctx.fillStyle = "#ffd83a";
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fill();
  }
}

export class Player {
  constructor(x, y, agentState = null) {
    this.x = x; this.y = y;
    this.radius = 14;
    this.maxHealth = 100;
    this.health = 100;
    this.moveSpeed = 150;
    this.fireCooldown = 0.35; this.fireTimer = 0;
    this.damage = 20;
    this.kills = 0; this.currency = 0; this.alive = true;
    if (agentState) this.applyState(agentState);
  }
  applyState(st) {
    const up = st.upgrades || {};
    this.maxHealth = 100 + (up.max_health || 0);
    this.moveSpeed = 150 + (up.speed || 0);
    this.damage = 20 + (up.damage || 0);
    this.fireCooldown = Math.max(0.05, 0.35 - (up.firerate || 0) * 0.03);
    this.health = Math.min(this.health, this.maxHealth);
  }
  update(dt) {
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.health <= 0) this.alive = false;
  }
  draw(ctx) {
    ctx.fillStyle = "#3cb4df";
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fill();
    // health bar
    const ratio = Math.max(0, this.health / this.maxHealth);
    const w = 40, h = 6;
    ctx.fillStyle = "#333"; ctx.fillRect(this.x - w/2, this.y - this.radius - 12, w, h);
    ctx.fillStyle = "#5be06e"; ctx.fillRect(this.x - w/2, this.y - this.radius - 12, w * ratio, h);
  }
}

export class Enemy {
  constructor(x, y, kind = "melee") {
    this.x = x; this.y = y; this.kind = kind; this.alive = true;
    if (kind === "melee") { this.speed = 90; this.radius = 12; this.health = 30; this.damage = 18; this.shoot = false; this.color = "#dc5a5a"; this.attackCooldown = 0.8; }
    else if (kind === "ranged") { this.speed = 60; this.radius = 12; this.health = 20; this.damage = 12; this.shoot = true; this.color = "#d4b24a"; this.attackCooldown = 1.2; }
    else if (kind === "fast") { this.speed = 140; this.radius = 10; this.health = 15; this.damage = 12; this.shoot = false; this.color = "#b86adf"; this.attackCooldown = 0.5; }
    else { this.speed = 80; this.radius = 12; this.health = 25; this.damage = 10; this.shoot = false; this.color = "#dc5a5a"; this.attackCooldown = 1.0; }
    this.attackTimer = 0;
  }
  update(dt, player, bullets) {
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    let dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) + 1e-6;
    const nx = dx / dist, ny = dy / dist;
    if (this.shoot) {
      const targetDist = 220;
      if (dist > targetDist) { this.x += nx * this.speed * dt; this.y += ny * this.speed * dt; }
      else {
        if (this.attackTimer <= 0) {
          this.attackTimer = this.attackCooldown;
          const bx = this.x + nx * (this.radius + 6);
          const by = this.y + ny * (this.radius + 6);
          bullets.push(new Bullet(bx, by, nx, ny, this, this.damage, 300));
        }
      }
    } else {
      this.x += nx * this.speed * dt; this.y += ny * this.speed * dt;
    }
  }
  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fill();
    // small health bar
    const ratio = Math.max(0, this.health)/30;
    const w = 30, h = 4;
    ctx.fillStyle = "#333"; ctx.fillRect(this.x - w/2, this.y - this.radius - 8, w, h);
    ctx.fillStyle = "#e06b6b"; ctx.fillRect(this.x - w/2, this.y - this.radius - 8, w * Math.min(1, ratio), h);
  }
}
