// Minimal top-down world: player, resources, enemies. No frameworks.
class Entity {
  constructor(x,y) { this.x = x; this.y = y; }
  distTo(other) { const dx = this.x - other.x, dy = this.y - other.y; return Math.hypot(dx,dy); }
}

class Player extends Entity {
  constructor(x,y) {
    super(x,y);
    this.speed = 80; // px/s
    this.health = 100;
    this.inventory = { resources: 0, ammo: 0 };
    this.size = 8;
    this.target = null; // {x,y} or entity
  }
  moveTowards(tx, ty, dt) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx,dy);
    if (d < 1) return;
    const nx = dx / d, ny = dy / d;
    this.x += nx * this.speed * dt;
    this.y += ny * this.speed * dt;
  }
  runAwayFrom(e, dt) {
    const dx = this.x - e.x, dy = this.y - e.y;
    const d = Math.hypot(dx,dy) || 1;
    const nx = dx / d, ny = dy / d;
    this.x += nx * this.speed * dt * 1.2;
    this.y += ny * this.speed * dt * 1.2;
  }
  pickup(res) {
    this.inventory.resources += 1;
  }
}

class Enemy extends Entity {
  constructor(x,y) {
    super(x,y);
    this.size = 10;
    this.speed = 40;
    this.dir = Math.random()*Math.PI*2;
    this.timer = Math.random()*2;
  }
  wander(dt, bounds) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.dir = Math.random()*Math.PI*2;
      this.timer = 1 + Math.random()*2;
    }
    this.x += Math.cos(this.dir) * this.speed * dt;
    this.y += Math.sin(this.dir) * this.speed * dt;
    // keep inside bounds
    this.x = Math.max(0, Math.min(bounds.w, this.x));
    this.y = Math.max(0, Math.min(bounds.h, this.y));
  }
}

class Resource extends Entity {
  constructor(x,y) { super(x,y); this.size=6; }
}

class Game {
  constructor(w,h) {
    this.w = w; this.h = h;
    this.player = new Player(w/2, h/2);
    this.enemies = [];
    this.resources = [];
    this.spawnInitial();
  }
  spawnInitial() {
    for (let i=0;i<5;i++) this.enemies.push(new Enemy(Math.random()*this.w, Math.random()*this.h));
    for (let i=0;i<6;i++) this.resources.push(new Resource(Math.random()*this.w, Math.random()*this.h));
  }
  update(dt) {
    // Enemies wander
    for (const e of this.enemies) e.wander(dt, this);
    // Player interactions: damage if close to enemy
    for (const e of this.enemies) {
      const d = this.player.distTo(e);
      if (d < 16) {
        // take damage over time
        this.player.health = Math.max(0, this.player.health - dt*8);
      }
    }
    // Pickup resources if close
    for (let i = this.resources.length - 1; i >= 0; i--) {
      const r = this.resources[i];
      if (this.player.distTo(r) < 12) {
        this.player.pickup(r);
        this.resources.splice(i,1);
      }
    }
    // occasional resource spawn
    if (Math.random() < dt * 0.2) {
      this.resources.push(new Resource(Math.random()*this.w, Math.random()*this.h));
    }
  }
  render(ctx) {
    // background
    ctx.fillStyle = '#222'; ctx.fillRect(0,0,this.w,this.h);

    // draw resources
    for (const r of this.resources) {
      ctx.fillStyle = '#6cf';
      ctx.beginPath(); ctx.arc(r.x, r.y, r.size,0,Math.PI*2); ctx.fill();
    }
    // draw enemies
    for (const e of this.enemies) {
      ctx.fillStyle = '#f66';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.size,0,Math.PI*2); ctx.fill();
    }
    // draw player
    const p = this.player;
    ctx.fillStyle = '#8f8';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size,0,Math.PI*2); ctx.fill();
    // HUD
    ctx.fillStyle = '#ddd'; ctx.font='12px monospace';
    ctx.fillText(`Health: ${Math.round(p.health)}  Resources: ${p.inventory.resources}`, 8, 14);
  }
}
