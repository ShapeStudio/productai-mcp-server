import { Router } from "express";
import { config } from "./config.js";

export const installRouter = Router();

const MCP_URL = (publicUrl: string) => `${publicUrl}/mcp`;

installRouter.get("/install", (_req, res) => {
  const mcpUrl = MCP_URL(config.publicUrl);
  res.type("html").send(renderInstallPage(mcpUrl));
});

function renderInstallPage(mcpUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Add ProductAI to Claude</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="https://create.productai.photo/logo-pai.svg">
<meta name="description" content="Connect ProductAI to Claude in under a minute. Generate, edit, and preview product photos in chat.">
<meta property="og:title" content="Add ProductAI to Claude">
<meta property="og:description" content="Connect ProductAI to Claude in under a minute. Generate, edit, and preview product photos in chat.">
<style>
  :root { color-scheme: light dark; --accent: #1a64ff; --accent-fg: #fff; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif;
    line-height: 1.55;
    color: #111;
    background: #fafafa;
    margin: 0;
    padding: 56px 24px 80px;
  }
  main { max-width: 640px; margin: 0 auto; }
  header { display: flex; gap: 16px; align-items: center; margin-bottom: 28px; }
  header img { width: 56px; height: 56px; border-radius: 12px; }
  header h1 { font-size: 26px; margin: 0; letter-spacing: -0.01em; }
  header .sub { color: #666; font-size: 14px; margin-top: 2px; }
  .url-card {
    background: #fff;
    border: 1px solid #e4e6ea;
    border-radius: 10px;
    padding: 14px 16px;
    margin: 16px 0 22px;
    display: flex;
    align-items: center;
    gap: 10px;
    overflow: hidden;
  }
  .url-card code {
    flex: 1;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13.5px;
    background: transparent;
    overflow-x: auto;
    white-space: nowrap;
    color: #111;
  }
  button.copy {
    background: #111; color: #fff; border: 0;
    padding: 8px 14px; border-radius: 6px; cursor: pointer;
    font-size: 13px; font-weight: 500;
  }
  button.copy:hover { background: #000; }
  button.copy.ok { background: #15803d; }
  .cta {
    display: inline-block; background: var(--accent); color: var(--accent-fg);
    padding: 12px 22px; border-radius: 9px; font-weight: 600; font-size: 15px;
    text-decoration: none; margin: 8px 8px 8px 0;
  }
  .cta.secondary { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
  ol { padding-left: 22px; }
  ol li { margin-bottom: 8px; }
  h2 { font-size: 17px; margin: 36px 0 10px; letter-spacing: -0.01em; }
  pre {
    background: #0f1115; color: #e9ecf1; padding: 12px 14px;
    border-radius: 8px; overflow-x: auto; font-size: 13px;
  }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  hr { border: none; border-top: 1px solid #e4e6ea; margin: 30px 0; }
  footer { font-size: 12.5px; color: #888; margin-top: 50px; }
  footer a { color: #888; }
  @media (prefers-color-scheme: dark) {
    body { background: #0e0f12; color: #e7e9ee; }
    .url-card { background: #15171b; border-color: #25282f; }
    .url-card code { color: #e7e9ee; }
    h1, h2 { color: #f3f5fa; }
    footer, footer a { color: #777; }
    .cta.secondary { color: #6aa3ff; border-color: #6aa3ff; }
    button.copy { background: #fff; color: #000; }
    button.copy:hover { background: #ddd; }
  }
</style>
</head>
<body>
<main>
  <header>
    <img src="https://create.productai.photo/logo-pai.svg" alt="ProductAI">
    <div>
      <h1>Add ProductAI to Claude</h1>
      <div class="sub">Generate, edit, and preview product photos in chat.</div>
    </div>
  </header>

  <p>Claude doesn't yet support one-click MCP installs from a button. Copy the URL below and follow the steps — under 60 seconds.</p>

  <div class="url-card">
    <code id="mcp-url">${escapeHtml(mcpUrl)}</code>
    <button class="copy" id="copy">Copy</button>
  </div>

  <a class="cta" href="https://claude.ai/settings/connectors" target="_blank" rel="noopener">Open Claude Connectors</a>
  <a class="cta secondary" href="/docs">Full docs</a>

  <h2>Steps</h2>
  <ol>
    <li>Open <a href="https://claude.ai/settings/connectors" target="_blank" rel="noopener">Settings → Connectors</a> in Claude.</li>
    <li>Click <strong>Add custom connector</strong>.</li>
    <li>Paste the URL above into the Server URL field and click <strong>Connect</strong>.</li>
    <li>Sign in with your <a href="https://create.productai.photo" target="_blank" rel="noopener">ProductAI</a> account when the Auth0 window appears.</li>
    <li>You're connected — ask Claude to generate a product photo.</li>
  </ol>

  <h2>Claude Code (CLI)</h2>
  <p>Run this in your terminal:</p>
  <pre><code>claude mcp add productai --transport http ${escapeHtml(mcpUrl)}</code></pre>

  <h2>What you can do once connected</h2>
  <ul>
    <li>Generate a studio-quality product photo from any image URL</li>
    <li>Compare 3-4 lighting / scene variants side-by-side</li>
    <li>Edit a product (swap background, change color, add accessories)</li>
    <li>Track and resume long-running jobs from inside a chat</li>
  </ul>

  <footer>
    Trusted by 20,000+ brands and creators. <a href="https://www.productai.photo">ProductAI</a> · <a href="https://www.productai.photo/legal">Privacy</a> · <a href="https://github.com/ShapeStudio/productai-mcp-server">Source</a>
  </footer>
</main>
<script>
  const btn = document.getElementById('copy');
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(${JSON.stringify(mcpUrl)});
      btn.textContent = 'Copied';
      btn.classList.add('ok');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('ok'); }, 2000);
    } catch (_) {
      const range = document.createRange();
      range.selectNode(document.getElementById('mcp-url'));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    }
  });
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
