// ai.js - simple one-hidden-layer neural agent with evolution & persistence
export class NeuralAgent {
  constructor(opts = {}) {
    this.inputSize = opts.inputSize || 14;
    this.hiddenSize = opts.hiddenSize || 32;
    this.outputSize = opts.outputSize || 5;
    this.sigma = opts.sigma || 0.12;

    // initialize weights
    this.W1 = randMatrix(this.hiddenSize, this.inputSize, 0.5);
    this.b1 = new Float32Array(this.hiddenSize);
    this.W2 = randMatrix(this.outputSize, this.hiddenSize, 0.5);
    this.b2 = new Float32Array(this.outputSize);

    this.bestFitness = -1e9;
    this.state = { upgrades: {} };

    this.loadIfExists();
  }

  forward(x) {
    // x: Float32Array length inputSize
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
    // inputs: JS array
    const x = new Float32Array(this.inputSize);
    for (let i = 0; i < this.inputSize; i++) x[i] = inputs[i] || 0;
    const out = this.forward(x);
    const moveX = Math.tanh(out[0] || 0);
    const moveY = Math.tanh(out[1] || 0);
    const shoot = 1 / (1 + Math.exp(-(out[2] || 0)));
    const shopVal = out[3] || 0;
    return { move: [moveX, moveY], shootProb: shoot, shopValue: shopVal };
  }

  mutate(scale = undefined) {
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

  save() {
    const obj = this.getParams();
    localStorage.setItem("saved_agent", JSON.stringify(obj));
    // also create an export blob if user wants to download
  }

  loadIfExists() {
    const raw = localStorage.getItem("saved_agent");
    if (!raw) return;
    try {
      const p = JSON.parse(raw);
      this.setParams(p);
      console.log("Loaded agent from localStorage bestFitness=", this.bestFitness);
    } catch (e) {
      console.warn("Failed to parse saved agent:", e);
    }
  }

  exportJSON() {
    const dataStr = JSON.stringify(this.getParams());
    return dataStr;
  }

  importJSON(jsonStr) {
    const p = JSON.parse(jsonStr);
    this.setParams(p);
    this.save();
  }
}

// utilities
function randMatrix(rows, cols, scale = 0.5) {
  const out = [];
  for (let i = 0; i < rows; i++) {
    const r = new Float32Array(cols);
    for (let j = 0; j < cols; j++) r[j] = gaussian() * scale;
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
function matrixToArray(mat) {
  return mat.map(r => Array.from(r));
}
function arrayToMatrix(arr) {
  return arr.map(r => Float32Array.from(r));
}
// simple gaussian random (Box-Muller)
function gaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
