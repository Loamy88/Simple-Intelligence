// Client-side instruction interpreter + agent/fallback FSM with explanation/status reporting.
// No server. Adds a simple "why" for each decision and keeps a short history log.

class Agent {
  constructor(player) {
    this.player = player;
    this.currentGoal = { type: 'wander' }; // e.g., {type:'collect',target:'resources', until:{health:60}}
    this.instructionText = '';
    this.goalTimeout = 0;
    this.fsmState = { current: 'idle' };

    // For UI & debug
    this.lastAction = null;
    this.lastReason = null;
    this.lastTargetDesc = null;
    this.history = []; // { t: Date.now(), text: "..." }
    this.maxHistory = 200;
  }

  setInstructions(instr) {
    if (!instr) return;
    const text = instr.text || JSON.stringify(instr);
    if (text !== this.instructionText) {
      this.instructionText = text;
      this.currentGoal = interpretInstructionText(text);
      this._pushLog(`New instructions: "${text}" -> goal=${this.currentGoal.type}`);
    }
  }

  tick(game, dt) {
    // Check high-level "until" conditions
    if (this.currentGoal.until) {
      const u = this.currentGoal.until;
      if (u.health !== undefined) {
        if (game.player.health >= u.health) {
          this._pushLog(`Goal satisfied: health >= ${u.health}. Switching to idle.`);
          this.currentGoal = { type: 'idle' };
        }
      }
    }

    // Decision frequency
    this.goalTimeout -= dt;
    if (this.goalTimeout <= 0) {
      this.goalTimeout = 0.18; // plan every ~180ms
      const plan = this.plan(game);
      this.execute(plan, game, dt);
    } else {
      // continue executing current movement
      this.continueMovement(dt);
    }
  }

  plan(game) {
    // Reset explanation fields; plan() will populate them
    this.lastReason = '';
    this.lastTargetDesc = '';

    // If low health -> flee
    if (game.player.health < 25) {
      const nearest = this.findNearest(game.enemies);
      if (nearest) {
        this.lastReason = `Low health (${Math.round(game.player.health)}). Flee from nearest enemy at (${Math.round(nearest.x)},${Math.round(nearest.y)}).`;
        this.lastTargetDesc = `enemy @ ${Math.round(nearest.x)},${Math.round(nearest.y)}`;
        return { action: 'flee', target: nearest };
      } else {
        this.lastReason = `Low health but no enemy found; idle to preserve health.`;
        return { action: 'idle' };
      }
    }

    // Goal: collect resources
    if (this.currentGoal.type === 'collect') {
      if (game.resources.length) {
        const nearestRes = this.findNearest(game.resources);
        if (nearestRes) {
          this.lastReason = `Goal=collect. Nearest resource at (${Math.round(nearestRes.x)},${Math.round(nearestRes.y)}). Moving to pick up.`;
          this.lastTargetDesc = `resource @ ${Math.round(nearestRes.x)},${Math.round(nearestRes.y)}`;
          return { action: 'move_to_entity', target: nearestRes };
        }
      }
      this.lastReason = `Goal=collect but no visible resources; wandering to find resources.`;
      return { action: 'wander' };
    }

    // Goal: avoid an area
    if (this.currentGoal.type === 'avoid') {
      if (this.currentGoal.area) {
        this.lastReason = `Goal=avoid area "${this.currentGoal.area.note}" radius=${this.currentGoal.area.r}. Moving away.`;
        this.lastTargetDesc = `avoid center ${this.currentGoal.area.x},${this.currentGoal.area.y} r=${this.currentGoal.area.r}`;
        return { action: 'avoid_area', area: this.currentGoal.area };
      }
      this.lastReason = `Goal=avoid but area unknown; idling.`;
      return { action: 'idle' };
    }

    // Idle or other goals -> wander by default
    if (this.currentGoal.type === 'idle') {
      this.lastReason = `Idle goal. Minimal movement to stay safe.`;
      return { action: 'wander' };
    }

    // Default fallback
    this.lastReason = `Default fallback: wander.`;
    return { action: 'wander' };
  }

  execute(plan, game, dt) {
    if (!plan) return;
    switch(plan.action) {
      case 'flee':
        this.player.target = { type: 'flee', entity: plan.target };
        this.lastAction = 'flee';
        break;
      case 'move_to_entity':
        this.player.target = { type: 'move_to', entity: plan.target };
        this.lastAction = 'move_to_entity';
        break;
      case 'avoid_area':
        const a = plan.area;
        const dx = this.player.x - a.x, dy = this.player.y - a.y;
        const d = Math.hypot(dx,dy) || 1;
        const tx = this.player.x + (dx/d)*100, ty = this.player.y + (dy/d)*100;
        this.player.target = { type: 'move_to_point', x: tx, y: ty };
        this.lastAction = 'avoid_area';
        break;
      case 'idle':
        this.player.target = null;
        this.lastAction = 'idle';
        break;
      case 'wander':
      default:
        if (!this.player.target || this.player.target.type !== 'wander' || Math.random() < 0.18) {
          const tx2 = Math.random()*game.w, ty2 = Math.random()*game.h;
          this.player.target = { type:'wander', x:tx2, y:ty2 };
        }
        this.lastAction = 'wander';
        break;
    }

    // If plan included a target entity, make a readable target string
    if (plan.target && plan.target.x !== undefined) {
      this.lastTargetDesc = `${plan.target.constructor.name} @ ${Math.round(plan.target.x)},${Math.round(plan.target.y)}`;
    } else if (plan.area) {
      this.lastTargetDesc = `area ${plan.area.x},${plan.area.y} r=${plan.area.r}`;
    }

    // push a short log entry
    this._pushLog(`Action=${this.lastAction} Goal=${this.currentGoal.type} Reason="${this.lastReason}" Target=${this.lastTargetDesc || '—'}`);
    // continue movement a bit this tick
    this.continueMovement(dt);
  }

  continueMovement(dt) {
    const t = this.player.target;
    if (!t) return;
    if (t.type === 'move_to' || t.type === 'move_to_point') {
      const tx = t.type === 'move_to' ? t.entity.x : t.x;
      const ty = t.type === 'move_to' ? t.entity.y : t.y;
      this.player.moveTowards(tx, ty, dt);
    } else if (t.type === 'flee') {
      if (t.entity) this.player.runAwayFrom(t.entity, dt);
    } else if (t.type === 'wander') {
      this.player.moveTowards(t.x, t.y, dt);
    }
    // clear target if reached
    let tx = null, ty = null;
    if (t.type === 'move_to') { tx = t.entity.x; ty = t.entity.y; }
    else if (t.type === 'move_to_point' || t.type === 'wander') { tx = t.x; ty = t.y; }
    if (tx !== null && Math.hypot(this.player.x - tx, this.player.y - ty) < 8) this.player.target = null;
  }

  findNearest(list) {
    if (!list || !list.length) return null;
    let best = list[0], bd = this.player.distTo(best);
    for (const e of list) {
      const d = this.player.distTo(e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // UI helpers
  getStatus() {
    return {
      goal: this.currentGoal.type + (this.currentGoal.target ? ` (${this.currentGoal.target})` : ''),
      action: this.lastAction,
      reason: this.lastReason,
      target: this.lastTargetDesc
    };
  }

  getHistory() {
    return this.history.slice(-this.maxHistory);
  }

  clearLog() {
    this.history = [];
  }

  _pushLog(text) {
    this.history.push({ t: Date.now(), text });
    if (this.history.length > this.maxHistory) this.history.shift();
  }
}

// Very small "natural language" -> goal interpreter (no LLM)
// Recognizes patterns like:
// "Collect resources until health > 60"
// "Collect ammo"
// "Avoid area x,y,r" or "avoid fire within 50 units"
function interpretInstructionText(text) {
  if (!text || typeof text !== 'string') return { type:'idle' };
  const s = text.toLowerCase();

  // collect resource
  if (s.includes('collect')) {
    const g = { type: 'collect', target: 'resources' };
    // parse "until health > 60"
    const m = s.match(/until\s+health\s*([<>]=?)\s*(\d+)/);
    if (m) {
      const op = m[1], val = parseInt(m[2],10);
      if (op === '>' || op === '>=' ) g.until = { health: val };
      if (op === '<' || op === '<=') g.until = { health_below: val };
    }
    if (s.includes('ammo')) g.target = 'ammo';
    return g;
  }

  // avoid pattern "avoid ... within N"
  if (s.includes('avoid')) {
    // try to parse "within N units" and a name token
    const m = s.match(/avoid\s+([a-z0-9 _-]+)\s+within\s+(\d+)\s*units?/);
    if (m) {
      const name = m[1].trim();
      const r = parseInt(m[2],10);
      // approximate: center at player's current coords is not known here; store note and radius
      return { type:'avoid', area: { x:0, y:0, r: r, note: name } };
    }
    // fallback: avoid generic -> stay idle
    return { type:'avoid' };
  }

  // fallback: if text mentions 'idle' or 'wait'
  if (s.includes('wait') || s.includes('idle')) return { type:'idle' };

  // default: collect resources
  return { type:'collect', target:'resources' };
}
