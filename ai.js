// Client-side instruction interpreter + agent/fallback FSM.
// No server. Simple natural-language parsing via keywords and small conditions.

class Agent {
  constructor(player) {
    this.player = player;
    this.currentGoal = { type: 'wander' }; // e.g., {type:'collect',target:'resources', until:{health:60}}
    this.instructionText = '';
    this.goalTimeout = 0;
    this.fsmState = { current: 'idle' };
  }

  setInstructions(instr) {
    if (!instr) return;
    // instr can be JSON: { text: "...", goal: "collect resources", ... }
    const text = instr.text || JSON.stringify(instr);
    if (text !== this.instructionText) {
      this.instructionText = text;
      this.currentGoal = interpretInstructionText(text);
      console.log('New goal:', this.currentGoal);
    }
  }

  tick(game, dt) {
    // Check high-level "until" conditions
    if (this.currentGoal.until) {
      // simple condition: health > N
      const u = this.currentGoal.until;
      if (u.health !== undefined) {
        if (game.player.health >= u.health) {
          // goal satisfied -> switch to idle or next
          this.currentGoal = { type: 'idle' };
        }
      }
    }

    // Very small decision frequency
    this.goalTimeout -= dt;
    if (this.goalTimeout <= 0) {
      this.goalTimeout = 0.2; // plan every 200ms
      const action = this.plan(game);
      this.execute(action, game, dt);
    } else {
      // continue executing current target
      this.continueMovement(dt);
    }
  }

  plan(game) {
    // If low health -> flee
    if (game.player.health < 25) {
      // flee from nearest enemy
      const nearest = this.findNearest(game.enemies);
      if (nearest) return { action: 'flee', target: nearest };
      else return { action: 'idle' };
    }

    // If goal is collect resources
    if (this.currentGoal.type === 'collect') {
      // if resource nearby -> move to it
      if (game.resources.length) {
        const nearestRes = this.findNearest(game.resources);
        if (nearestRes) return { action: 'move_to_entity', target: nearestRes };
      }
      // nothing known -> wander
      return { action: 'wander' };
    }

    if (this.currentGoal.type === 'avoid') {
      // avoid area or tag (we only have simple avoidance: a circle)
      if (this.currentGoal.area) {
        return { action: 'avoid_area', area: this.currentGoal.area };
      }
      return { action: 'idle' };
    }

    // default: wander
    return { action: 'wander' };
  }

  execute(plan, game, dt) {
    if (!plan) return;
    switch(plan.action) {
      case 'flee':
        this.player.target = { type: 'flee', entity: plan.target };
        this.continueMovement(dt);
        break;
      case 'move_to_entity':
        this.player.target = { type: 'move_to', entity: plan.target };
        this.continueMovement(dt);
        break;
      case 'avoid_area':
        // naive: pick a random point away from area center
        const a = plan.area;
        const dx = this.player.x - a.x, dy = this.player.y - a.y;
        const d = Math.hypot(dx,dy) || 1;
        const tx = this.player.x + (dx/d)*100, ty = this.player.y + (dy/d)*100;
        this.player.target = { type: 'move_to_point', x: tx, y: ty };
        this.continueMovement(dt);
        break;
      case 'wander':
      default:
        // random small target
        if (!this.player.target || this.player.target.type !== 'wander' || Math.random() < 0.2) {
          const tx = Math.random()*game.w, ty = Math.random()*game.h;
          this.player.target = { type:'wander', x:tx, y:ty };
        }
        this.continueMovement(dt);
        break;
    }
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
    const tx = (t.type === 'move_to' ? t.entity.x : t.x) || 0;
    const ty = (t.type === 'move_to' ? t.entity.y : t.y) || 0;
    if (Math.hypot(this.player.x - tx, this.player.y - ty) < 8) this.player.target = null;
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
      // we don't have named hazards; approximate as avoid around current player coords
      return { type:'avoid', area: { x:0, y:0, r: r, note: name } };
    }
    // fallback: avoid generic -> stay idle
    return { type:'avoid' };
  }

  // fallback: if text mentions 'idle' or 'wait'
  if (s.includes('wait') || s.includes('idle')) return { type:'idle' };

  // default: wander
  return { type:'collect', target:'resources' };
}
