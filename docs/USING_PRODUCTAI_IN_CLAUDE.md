# Use ProductAI inside Claude

Connect ProductAI to Claude (Claude.ai, Claude Desktop, or Claude Code) and generate product photos by chatting. No copying API keys, no leaving the conversation — the finished images appear inline so you can compare variants side by side.

![hero placeholder — three sneaker variants rendered inline in a Claude chat](https://create.productai.photo/docs/mcp/hero.jpg)

## What you can do

- *"Generate a product photo of this sneaker on a clean white marble surface — give me 3 variants"* → three completed images appear directly in the chat.
- *"Re-shoot this candle with warm evening light on a wooden table"* → one variant, finished.
- *"Use kontext-pro to add sunglasses to this product"* → swaps the model under the hood, returns the result.
- *"Check the status of job 245922"* → reports back the live status, attaches the image when ready.

You stay in Claude the whole time.

## One-time setup (under a minute)

1. Open **Settings → Connectors → Add custom connector** in Claude.
2. Server URL:
   ```
   https://mcp.productai.photo/mcp
   ```
3. Click **Connect**. A window opens.
4. Sign in with your existing **ProductAI** account (`create.productai.photo`).
5. That's it — Claude lists the four ProductAI tools and the connector shows **Connected**.

You never touch an API key. The connector mints (or reuses) one on your account automatically the first time you call a tool.

![setup placeholder — connectors screen showing ProductAI connected](https://create.productai.photo/docs/mcp/setup.jpg)

## Tools the connector exposes

| Tool | What it does |
|---|---|
| `generate_image` | Start a generation job (1–4 variants in parallel). |
| `generate_and_wait` | Start, wait, and return the finished image(s) in one step. |
| `get_job` | Look up a job by ID; returns the image inline when complete. |
| `wait_for_job` | Poll a running job until it finishes. |

You don't normally call these by name — just describe what you want and Claude picks the right one.

## Example prompts

**Quick re-shoot**
> Here's a sneaker: `https://example.com/product.jpg` — place it on a clean white marble surface, soft natural daylight from the left.

**Compare variants**
> Generate 3 variants of this candle on a wooden table, warm evening lighting, slight bokeh.

**Edit a product**
> Use `kontext-pro` on this image — add aviator sunglasses to the model, keep everything else identical.

**Track a long job**
> What's the status of ProductAI job 270035?

## Models available

`nanobananapro` (default, best quality), `gpt-low`, `gpt-medium`, `gpt-high`, `kontext-pro`, `kontext-max`, `nanobanana`, `seedream`.

Multi-image input (passing several reference photos in one call) works with `seedream` and `nanobanana`.

## Credits, billing, and limits

- Each generation deducts credits from your ProductAI balance — same as the dashboard or direct API.
- Use `count: 3` and you'll be charged for three generations (one per variant).
- Manage your subscription and credits at https://create.productai.photo.

## Privacy & security

- The connector authenticates via your existing ProductAI account through Auth0. No password is ever stored.
- Image URLs you paste are uploaded once to ProductAI's processing pipeline (the same one the dashboard uses) and then handed to the model.
- Generated images live in the same S3 bucket as your dashboard outputs and follow your account's retention policy.
- The MCP server itself is open source: https://github.com/ShapeStudio/productai-mcp-server.

## Troubleshooting

**"Authorization failed" when connecting.** Sign in to https://create.productai.photo first to make sure your account is active, then retry.

**Connector connects but a generation never starts.** Your account may be out of credits. Check `create.productai.photo/dashboard`.

**"Could not provision a ProductAI API key for this account."** Rare race condition; retry the same prompt and it'll succeed.

**Want to use ProductAI from a local script instead of Claude?** The original stdio version is at https://github.com/ShapeStudio/productai-mcp — same tools, no auth flow needed.

## Support

Email **support@productai.photo**, or open an issue at https://github.com/ShapeStudio/productai-mcp-server/issues.
