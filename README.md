```markdown
# GH Pages Roguelite AI Demo (static-only)

This example runs entirely on GitHub Pages (static hosting). There is no server, no API keys, and no external LLM calls.

What it includes:
- index.html: canvas game UI and bootstrap
- game.js: small top-down game (player, enemies, resources)
- ai.js: client-side instruction interpreter and agent/fallback FSM
- instructions.json: text instructions you can edit via GitHub

How to host on GitHub Pages:
1. Create a new repository (or use an existing one).
2. Add the above files to the repository root or to the `docs/` folder.
3. In repository Settings -> Pages, choose the branch (main) and folder (`/ (root)` or `/docs`) and save.
4. Visit the GitHub Pages URL shown in the settings; the game should load.

How to change instructions:
- Edit `instructions.json` in the repository and push changes.
- The game fetches the file every ~3 seconds and updates the agent's behavior.

Limitations and next steps:
- This demo does not use an LLM. GitHub Pages is static and cannot hold private API keys or run server code.
- Options to use an LLM while still hosting static files:
  - Use a serverless function (Cloudflare Workers, Netlify Functions, Vercel Serverless) to act as a secure proxy for the LLM API; keep the key there. The GitHub Pages site would call that function.
  - Run a WebAssembly / in-browser model like llama.cpp via wasm (heavy; model files are large).
  - Use GitHub Actions to regenerate a parsed instructions.json periodically (Actions can call an LLM) — this is not real-time but can be used for semi-static instruction generation.
- If you want, I can help:
  - Add Cloudflare Worker example to proxy to OpenAI without exposing keys.
  - Show how to integrate a small on-device model (llama.js) and host model files on a separate CDN.

Enjoy! Open the repo's GitHub Pages URL to try it.
```
