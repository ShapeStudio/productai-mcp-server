import { Router } from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { marked } from "marked";

export const docsRouter = Router();

const here = dirname(fileURLToPath(import.meta.url));
// dist/docs.js → ../docs/USING_PRODUCTAI_IN_CLAUDE.md
const mdPath = resolve(here, "..", "docs", "USING_PRODUCTAI_IN_CLAUDE.md");

let cachedHtml: string | null = null;

function render(): string {
  if (cachedHtml) return cachedHtml;
  const md = readFileSync(mdPath, "utf8");
  const body = marked.parse(md, { async: false }) as string;
  cachedHtml = wrap(body);
  return cachedHtml;
}

function wrap(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Use ProductAI inside Claude</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="https://create.productai.photo/logo-pai.svg">
<meta name="description" content="Connect ProductAI to Claude and generate product photos in chat. The official MCP connector docs.">
<meta property="og:title" content="Use ProductAI inside Claude">
<meta property="og:description" content="Connect ProductAI to Claude and generate product photos in chat.">
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif;
    line-height: 1.55;
    color: #111;
    background: #fafafa;
    margin: 0;
    padding: 40px 24px 80px;
  }
  main { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 32px; margin: 0 0 8px; letter-spacing: -0.01em; }
  h2 { font-size: 22px; margin: 40px 0 12px; letter-spacing: -0.01em; }
  h3 { font-size: 17px; margin: 28px 0 8px; }
  p, li { font-size: 16px; }
  code {
    background: #eef0f3;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 14px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  pre {
    background: #0f1115;
    color: #e9ecf1;
    padding: 14px 16px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 13.5px;
  }
  pre code { background: transparent; padding: 0; color: inherit; }
  a { color: #1a64ff; }
  a:hover { text-decoration: underline; }
  table { border-collapse: collapse; margin: 12px 0; }
  th, td { padding: 8px 12px; border-bottom: 1px solid #e4e6ea; text-align: left; font-size: 15px; }
  th { background: #f1f3f6; font-weight: 600; }
  blockquote {
    border-left: 3px solid #d6d8dc;
    margin: 12px 0;
    padding: 4px 14px;
    color: #555;
    background: #f3f4f6;
    border-radius: 0 6px 6px 0;
  }
  img { max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; }
  hr { border: none; border-top: 1px solid #e4e6ea; margin: 36px 0; }
  footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e4e6ea; font-size: 13px; color: #888; }
  @media (prefers-color-scheme: dark) {
    body { background: #0e0f12; color: #e7e9ee; }
    h1, h2, h3 { color: #f3f5fa; }
    code { background: #1a1d23; color: #e7e9ee; }
    th { background: #1a1d23; }
    th, td { border-bottom-color: #25282f; }
    a { color: #6aa3ff; }
    blockquote { background: #15171b; color: #bbb; border-left-color: #2a2d33; }
    footer { color: #777; border-top-color: #25282f; }
  }
</style>
</head>
<body>
<main>
${body}
<footer>
ProductAI MCP connector · <a href="https://github.com/ShapeStudio/productai-mcp-server">Source</a> · <a href="https://www.productai.photo/legal">Privacy &amp; Terms</a>
</footer>
</main>
</body>
</html>`;
}

docsRouter.get("/docs", (_req, res) => {
  res.type("html").send(render());
});

// Convenience alias for crawlers
docsRouter.get("/docs/mcp", (_req, res) => {
  res.redirect(301, "/docs");
});
