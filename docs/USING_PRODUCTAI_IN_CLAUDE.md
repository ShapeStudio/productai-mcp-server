# ProductAI in Claude — Accurate on-brand AI Product Photos and more

> ProductAI transforms your product shots into realistic, high-converting AI product photos. No design skills needed. **Trusted by 20,000+ brands and creators.**

Now available inside Claude (Claude.ai, Claude Desktop, or Claude Code). Generate, edit, and preview product photos by chatting — no copying API keys, no leaving the conversation. Finished images appear inline so you can compare variants side by side.

![hero placeholder — three sneaker variants rendered inline in a Claude chat](https://create.productai.photo/docs/mcp/hero.jpg)

## What you can do

- *"Generate a product photo of this sneaker on a clean white marble surface — give me 3 variants"* → three completed images appear directly in the chat.
- *"Re-shoot this candle with warm evening light on a wooden table"* → one variant, finished.
- *"Use kontext-pro to add sunglasses to this product"* → swaps the model under the hood, returns the result.
- *"Check the status of job 245922"* → reports back the live status, attaches the image when ready.
- *"How good are the photos on mystore.com/products/candle?"* → a score out of 100 and a list of what to fix.
- *"Import these three products and shoot each on marble"* → products land in your catalogue, then get re-shot.
- *"Make a template from this Pinterest pin"* → a reusable scene you can put any product into.
- *"Did the label change in that last photo?"* → the fidelity check compares it with your original.

You stay in Claude the whole time.

## One-time setup (under a minute)

Fastest: click [**Add to Claude**](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=ProductAI&connectorUrl=https%3A%2F%2Fmcp.productai.photo%2Fmcp) — Claude opens with the connector pre-filled. Confirm, sign in, done.

Or add it manually:

1. Open **Settings → Connectors → Add custom connector** in Claude.
2. Server URL:
   ```
   https://mcp.productai.photo/mcp
   ```
3. Click **Connect**. A window opens.
4. Sign in with your existing **ProductAI** account (`create.productai.photo`).
5. That's it — Claude lists the ProductAI tools and the connector shows **Connected**.

You never touch an API key. The connector mints (or reuses) one on your account automatically the first time you call a tool.

![setup placeholder — connectors screen showing ProductAI connected](https://create.productai.photo/docs/mcp/setup.jpg)

## Tools the connector exposes

**Create**

| Tool | What it does |
|---|---|
| `generate_image` | Start a generation job (1–4 variants in parallel). |
| `generate_and_wait` | Start, wait, and return the finished image(s) in one step. |
| `generate_video` | Start a product video (Seedance 2.0 or Gemini Omni). |
| `get_job` | Look up a job by ID; returns the image inline when complete. |
| `wait_for_job` | Poll a running job until it finishes. |
| `upload_asset` | Upload a photo from the chat and get a hosted URL to generate from. |

**Workflows**

| Tool | What it does |
|---|---|
| `start_onboarding` | Guided first run: learns what you sell, then walks you to your first photo step by step. |
| `test_pdp` | Score the photos on a product page or whole store (out of 100) and list what to fix. Free. |
| `import_products` | Import products from product page links (up to 10) into your catalogue, photos included. |
| `list_products` | List the products already in your catalogue. |
| `create_template_from_pinterest` | Turn a Pinterest pin into a reusable scene template saved to your account. |
| `list_templates` | Browse scene templates by category, or your own saved ones. |
| `check_fidelity` | Compare a generated photo with your original and flag any change to the product (text, colour, shape, missing parts, size). Free. |

You don't normally call these by name — just describe what you want and Claude picks the right one.

## Example prompts

**Quick re-shoot**
> Here's a sneaker: `https://example.com/product.jpg` — place it on a clean white marble surface, soft natural daylight from the left.

**Compare variants**
> Generate 3 variants of this candle on a wooden table, warm evening lighting, slight bokeh.

**Edit a product**
> Use `kontext-pro` on this image — add aviator sunglasses to the model, keep everything else identical.

**Check a product page**
> How good are the photos on `https://mystore.com/products/amber-candle`? What should I fix?

**Import and re-shoot**
> Import `https://mystore.com/products/amber-candle` and `https://mystore.com/products/oud-candle`, then put each on a dark walnut table.

**Template from Pinterest**
> Make a template from `https://pinterest.com/pin/123456789/` and use it on my amber candle.

**Check the product stayed exact**
> Check job 270035 — did the label or colour change?

**New here?**
> Help me get started with ProductAI.

**Track a long job**
> What's the status of ProductAI job 270035?

## Models available

**Reference files** (`upload_asset`): Attach an image in chat (or give a URL) and it's uploaded to ProductAI, returning a hosted URL you can pass as `image_url` to any of the tools below. Max 10MB; PNG, JPG, or WebP.

**Image** (`generate_image` / `generate_and_wait`): `nanobanana2.1` (default), `nanobananapro` (best quality), `gpt-2.6`, `gpt-2.6-precise`, `gpt-2.5`, `gpt-2.5-precise`, `gpt-2`, `gpt-1.5`, `gpt-low`, `gpt-medium`, `gpt-high`, `kontext-pro`, `kontext-max`, `nanobanana`, `nanobanana2`, `seedream`, `seedream-5-lite`, `seedream-5-pro`.

- `gpt-2.6` — OpenAI GPT Image 2.6, the best GPT model: better images and faster (~11s) than `gpt-2`. 10 credits.
- `gpt-2.6-precise` — the precise-edit variant of GPT Image 2.6: changes only what you ask for and keeps the product, composition and background as they are. Best for small targeted edits to an existing photo; slower (~25–30s). 10 credits.
- `gpt-2.5`, `gpt-2.5-precise` — the previous version. They keep working for existing workflows; use the 2.6 names for new work. 10 credits.
- `nanobanana2.1` — Google Nano Banana 2.1, the successor to `nanobanana2`, and the default: most of `nanobananapro` at 5 credits instead of 8.

Multi-image input (passing several reference photos in one call, up to 5) works with `gpt-2.6`, `gpt-2.6-precise`, `gpt-2.5`, `gpt-2.5-precise`, `gpt-2`, `gpt-1.5`, `seedream`, `nanobananapro`, `nanobanana`, `nanobanana2`, and `nanobanana2.1`; `seedream-5-lite` and `seedream-5-pro` take up to 10.

**Video** (`generate_video`): Seedance 2.0. Give a prompt and, optionally, one or more reference images (up to 9) to animate a product — omit the image for text-to-video. Options: `resolution` (480p/720p/1080p/4k), `aspect_ratio`, `duration` (4–15s or auto), `generate_audio`. It returns a short **video** (a video URL, not a still) and takes a few minutes, so start it and check back with `wait_for_job` or `get_job`. Billed per second of output scaled by resolution (e.g. a 5s 720p clip ≈ 35 credits).

## Credits, billing, and limits

- Each generation deducts credits from your ProductAI balance — same as the dashboard or direct API.
- Use `count: 3` and you'll be charged for three generations (one per variant).
- The page check (`test_pdp`), fidelity check, product import, templates and onboarding don't use credits. The page check is limited to 10 per hour per account.
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
