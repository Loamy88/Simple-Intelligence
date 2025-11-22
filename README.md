```markdown
# Roguelite (Browser) — You Spawn Enemies, AI Controls Player

This is a browser port of the earlier Python/pygame prototype so it can be hosted on GitHub Pages.

Features
- Top-down roguelite: you (the user) spawn enemies (keys 1/2/3 at mouse).
- The AI controls the player using a small neural network (one hidden layer).
- The AI persists weights to localStorage; you can export/import JSON too.
- Basic hill-climb evolution: training toggles background headless episodes that mutate weights and keep improvements.
- Periodic shop where the AI buys upgrades with in-run currency.

How to run locally
- Open index.html in a browser (Chrome/Firefox recommended).
- Or run a simple static server:
  - Python 3: python -m http.server 8000
  - Then open http://localhost:8000

Deploy to GitHub Pages
1. Create a new GitHub repository (or use an existing one).
2. Add these files to the repository in the root (index.html, style.css, main.js, ai.js, entities.js).
3. Commit and push.
4. In the repository settings -> Pages, set the source to the main branch / root (or the docs folder if you prefer).
5. Save — GitHub Pages will provide a URL where the site is hosted (usually https://<your-username>.github.io/<repo>/).
6. Open that URL in your browser. LocalStorage is used to persist the AI between visits.

Notes & next steps
- The NN is intentionally small and uses a simple mutation strategy. If you want stronger learning, I can add a population-based NEAT or integrate a WebAssembly ML backend.
- I can also add a nicer UI for the shop, progress visualization of weights, or a "replay" export.
```
