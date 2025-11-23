```markdown
# Roguelite — Auto-Training & Play vs AI (Browser)

This repository contains a single-page browser game that supports two modes:

- Auto Train: runs many short headless episodes (accelerated) to evolve a small neural network (hill-climb mutation). The best weights are saved to localStorage ("saved_agent_v2") and can be exported/imported as JSON.
- Play vs AI: loads saved weights and runs a paused run where the human spawns enemies with points and then starts the run. The AI uses its saved weights and can buy upgrades with gold earned from kills. AI purchases persist between runs.

How it works (summary)
- Neural network: one hidden layer (configurable). Decision outputs movement, shoot probability, and a shop value.
- Training: repeatedly mutates a copy of the network and simulates a short headless episode (no rendering). If fitness improves, the mutated weights replace the best weights and are persisted. The shop is simulated: the AI collects gold and buys upgrades greedily.
- Play: loads saved weights; the run is paused until Start. The player spends points to spawn enemies (click canvas or use spawn buttons). AI purchases happen automatically during the run and upgrades apply immediately.

Files
- index.html — page & UI
- style.css — styling
- ai.js — neural agent, persistence, shop logic
- entities.js — player/enemy/bullet entities (weapons, multishot, pierce, heal)
- main.js — the main glue: auto-trainer, play mode, UI, and rendering

Run locally
- Serve with a static server (recommended):
  - python -m http.server 8000
  - open http://localhost:8000

Deploy to GitHub Pages
- Push these files to a repository (root or docs/).
- Enable GitHub Pages in repository settings (select the branch & folder used).
- Open the published URL.

Notes & Next Steps
- This is a prototype. Training runs in the main thread and is intentionally lightweight; moving training to a Web Worker will avoid any UI hiccups if you train heavily.
- If you want faster training or more advanced neuroevolution/gradient-based learning, I can add a basic population-based neuroevolution or integrate a WASM-backed RL library.
- I can also add better enemy spawn controls (spawn at mouse), sound, and sprite art.

Enjoy! If you hit any runtime errors in the browser console, paste the error here and I'll patch it quickly.
