// ai.js - neural agent with persistent weights, shop & upgrades, and simple hill-climb evolution.
// Persisted to localStorage as "saved_agent_v2".
export class NeuralAgent {
  constructor(opts = {}) {
    this.inputSize = opts.inputSize || 14;
    this.hiddenSize = opts.hiddenSize || 48;
    this.outputSize = opts.outputSize || 5;
    this.sigma = opts.sigma || 0.12;

    this.W1 = randMatrix(this.hiddenSize, this.inputSize, 0.5);
    this.b1 = new Float32Array(this.hiddenSize);
    this.W2 = randMatrix(this.outputSize, this.hiddenSize, 0.5);
    this.b2 = new Float32Array(this.outputSize);

    this.bestFitness = -1e9;
    // persistent upgrades & state persisted between runs
    this.state = { upgrades: {}, gold: 0 };

    this.loadIfExists();
  }

  forward(x) {
    const h = new Float32Array(this.hiddenSize);
    for (let i = 0; i < this.hiddenSize; i++) {
      let s = this.b1[i];
      const row = this.W1[i];
      for (let j = 0; j < this.inputSize; j++) s += row[j] * x[j];
      h[i] = Math.tanh(s);
    }
    const out = new Float32Array(this.outputSize);
    for (let i = 0; i < this.outputSize; i++) {
      let s = this.b2[i];
      const row = this.W2[i];
      for (let j = 0; j < this.hiddenSize; j++) s += row[j] * h[j];
      out[i] = s;
    }
    return out;
  }

  decide(inputs) {
    // inputs -> forward -> interpret
    const x = new Float32Array(this.inputSize);
    for (let i = 0; i < this.inputSize; i++) x[i] = inputs[i] || 0;
    const out = this.forward(x);
    const moveX = Math.tanh(out[0] || 0);
    const moveY = Math.tanh(out[1] || 0);
    const shoot = 1 / (1 + Math.exp(-(out[2] || 0)));
    const shopVal = out[3] || 0;
    const special = out[4] || 0;
    return { move: [moveX, moveY], shootProb: shoot, shopValue: shopVal, special: special };
  }

  mutate(scale) {
    const s = (scale !== undefined) ? scale : this.sigma;
    perturbMatrix(this.W1, s);
    perturbArray(this.b1, s);
    perturbMatrix(this.W2, s);
    perturbArray(this.b2, s);
  }

  getParams() {
    return {
      W1: matrixToArray(this.W1),
      b1: Array.from(this.b1),
      W2: matrixToArray(this.W2),
      b2: Array.from(this.b2),
      bestFitness: this.bestFitness,
      sigma: this.sigma,
      state: this.state
    };
  }

  setParams(p) {
    if (p.W1) this.W1 = arrayToMatrix(p.W1);
    if (p.b1) this.b1 = Float32Array.from(p.b1);
    if (p.W2) this.W2 = arrayToMatrix(p.W2);
    if (p.b2) this.b2 = Float32Array.from(p.b2);
    if (p.bestFitness !== undefined) this.bestFitness = p.bestFitness;
    if (p.sigma !== undefined) this.sigma = p.sigma;
    if (p.state) this.state = p.state;
  }

  tryUpdateBest(fitness) {
    if (fitness > this.bestFitness) {
      this.bestFitness = fitness;
      this.sigma = Math.max(0.005, this.sigma * 0.96);
      this.save();
      return true;
    } else {
      this.sigma = Math.min(0.9, this.sigma * 1.02);
      return false;
    }
  }

  // AI shop: buys as much as possible based on state.gold
  // options is an array of shop options {name,key,amount,cost,repeatable(boolean)}
  shopBuyLoop(options) {
    const up = this.state.upgrades || {};
    let bought = [];
    // greedy: while gold and there exists affordable option, pick best value/cost heuristic
    let changed = true;
    while (changed) {
      changed = false;
      // filter affordable
      const affordable = options.filter(o => (this.state.gold >= o.cost));
      if (affordable.length === 0) break;
      // choose best by simple heuristic: (o.valuePerCost) -> here prefer damage & multishot slightly more
      affordable.sort((a,b) => {
        const va = (a.value || 1) / a.cost * ((a.priority||1));
        const vb = (b.value || 1) / b.cost * ((b.priority||1));
        return vb - va;
      });
      const pick = affordable[0];
      // apply
      this.state.gold -= pick.cost;
      up[pick.key] = (up[pick.key] || 0) + (pick.amount || 1);
      bought.push(pick.name);
      changed = true;
      if (!pick.repeatable) {
        // remove non-repeatable by marking cost huge
        pick.cost = 1e9;
      }
    }
    this.state.upgrades = up;
    return bought;
  }

  save() {
    try {
      const obj = this.getParams();
      localStorage.setItem("saved_agent_v2", JSON.stringify(obj));
    } catch (e) {
      console.warn("Save failed", e);
    }
  }

  loadIfExists() {
    try {
      const raw = localStorage.getItem("saved_agent_v2");
      if (!raw) return;
      const p = JSON.parse(raw);
      this.setParams(p);
      console.log("Loaded agent; bestFitness=", this.bestFitness);
    } catch (e) {
      console.warn("Load failed", e);
    }
  }

  exportJSON() {
    return JSON.stringify(this.getParams());
  }

  importJSON(jsonStr) {
    const p = JSON.parse(jsonStr);
    this.setParams(p);
    this.save();
  }
}

// utilities
function randMatrix(rows, cols, scale) {
  const out = [];
  for (let i = 0; i < rows; i++) {
    const r = new Float32Array(cols);
    for (let j = 0; j < cols; j++) r[j] = gaussian() * (scale || 0.5);
    out.push(r);
  }
  return out;
}
function perturbMatrix(mat, s) {
  for (let i = 0; i < mat.length; i++) {
    const row = mat[i];
    for (let j = 0; j < row.length; j++) row[j] += gaussian() * s;
  }
}
function perturbArray(arr, s) {
  for (let i = 0; i < arr.length; i++) arr[i] += gaussian() * s;
}
function matrixToArray(mat) { return mat.map(r => Array.from(r)); }
function arrayToMatrix(arr) { return arr.map(r => Float32Array.from(r)); }
function gaussian() {
  let u=0,v=0; while(u===0)u=Math.random(); while(v===0)v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
