// Netlify function: save-ai.js
// Deploy to Netlify (or adapt for Vercel). This function receives a POST { filename, content, message }
// and creates/updates that file in the specified GitHub repo using the GITHUB_TOKEN environment variable.
//
// Set Netlify environment variables:
// - GITHUB_TOKEN : a personal access token with repo scope (or repository access).
// - REPO_OWNER   : your GitHub username, e.g. "Loamy88"
// - REPO_NAME    : repository name, e.g. "Simple-Intelligence"
// - TARGET_PATH  : path to write file in repo, default "ai_weights.json" (you can override per-request too)
// - BRANCH       : branch name, e.g. "main"

const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method not allowed' }) };
  }
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER;
  const REPO_NAME = process.env.REPO_NAME;
  const BRANCH = process.env.BRANCH || 'main';
  if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME) {
    return { statusCode: 500, body: JSON.stringify({ message: 'Server not configured: missing env vars' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON' }) };
  }

  const filename = body.filename || process.env.TARGET_PATH || 'ai_weights.json';
  const contentStr = body.content; // expect string (JSON string)
  const message = body.message || 'Update AI weights from web client';

  if (!contentStr) return { statusCode: 400, body: JSON.stringify({ message: 'Missing content' }) };

  const path = filename;
  const apiBase = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(path)}`;

  // Step 1: check if file exists to get SHA for update
  try {
    const getResp = await fetch(`${apiBase}?ref=${BRANCH}`, {
      method: 'GET',
      headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'save-ai-function' }
    });

    let sha = null;
    if (getResp.status === 200) {
      const data = await getResp.json();
      sha = data.sha;
    } else if (getResp.status !== 404) {
      const text = await getResp.text();
      return { statusCode: getResp.status, body: JSON.stringify({ message: 'GitHub GET failed', detail: text }) };
    }

    // Step 2: PUT to create or update
    const payload = {
      message: message,
      content: Buffer.from(contentStr).toString('base64'),
      branch: BRANCH
    };
    if (sha) payload.sha = sha;

    const putResp = await fetch(apiBase, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'save-ai-function',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const putJson = await putResp.json();
    if (!putResp.ok) {
      return { statusCode: putResp.status, body: JSON.stringify({ message: 'GitHub PUT failed', detail: putJson }) };
    }

    return { statusCode: 200, body: JSON.stringify({ message: 'Saved', result: putJson }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: 'Server error', error: String(err) }) };
  }
};
