# Top-Down Roguelite: You Spawn Enemies, AI Controls the Player

A small prototype/top-down roguelite where:
- You (the user) spawn enemies of different types and try to defeat an AI-controlled player.
- The AI is a simple neural network that "learns" between runs using an online evolutionary (hill-climb) strategy — the best weights are saved to disk and loaded on the next run.
- The AI collects currency by killing enemies and can buy upgrades in a shop that appears periodically.
- Two modes:
  - Play mode (default): Interactive. You spawn enemies with keys and watch the AI play using the saved best network.
  - Train mode (`--train`): Autonomous training where random enemies are spawned; the AI evolves weights based on episode fitness and saves improvements.

This is a prototype — intended as a starting point to extend with more sophisticated learning (NEAT / PPO / Q-learning) or richer game mechanics.

Controls (in Play mode)
- 1: spawn a Melee enemy at mouse position
- 2: spawn a Ranged enemy at mouse position
- 3: spawn a Fast enemy at mouse position
- T: toggle autonomous training on/off (in play mode it will run episodes in the background)
- S: save current AI weights and upgrade state
- L: load saved AI weights (if present)
- ESC / Close window: quit

Requirements
- Python 3.8+
- pygame
- numpy

Install dependencies:
pip install -r requirements.txt

Run
- Play (interactive): python main.py
- Train headless (autonomous): python main.py --train

Files
- main.py: game loop, input handling, play & train modes
- ai/agent.py: neural network agent, decision, persist weights, simple evolutionary hill-climb trainer
- entities.py: Player (AI-controlled), Enemy, Bullet & basic behaviors
- utils.py: constants, helper functions
- requirements.txt

Notes
- The AI network input is limited (nearest enemies, health, currency) and outputs movement, shooting and shop/purchase decisions.
- The learning algorithm is intentionally simple (hill-climb mutation + keep-best) to keep the demo self-contained and deterministic.
- Saved data: `saved_agent.npz` contains arrays for weights/biases and `saved_state.json` contains persistent upgrade state (optional).

If you'd like:
- Replace the learning algorithm with NEAT or a RL algorithm (I can add an example using neat-python or stable-baselines).
- More enemy types, levels, procedural rooms, or visual polish.
- A UI for shop/upgrade selection and stats display.

Have fun experimenting — spawn lots of enemies and watch the AI adapt!
