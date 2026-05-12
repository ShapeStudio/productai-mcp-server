---
name: productai
description: |
  Use this skill whenever the user wants to generate, edit, or
  improve a product photo for an ecommerce listing, ad creative,
  social post, or marketplace upload. Triggers on any prompt that
  pairs a product image URL with words like "re-shoot", "scene",
  "background", "studio shot", "lifestyle", "variants", "ad
  creative", or names a platform like Shopify, Amazon, Etsy, Meta,
  TikTok. Also use when the user asks to edit a product (swap
  colors, add accessories, change details) on top of an existing
  image. Pairs with the ProductAI MCP connector
  (mcp.productai.photo).
---

# ProductAI — generating great product photos in Claude

ProductAI turns a product snapshot into a realistic, on-brand,
high-converting product photo. This skill describes how to use it
well from inside Claude. Trusted by 20,000+ brands and creators.

## When this skill fires

Use the ProductAI tools when the user:

- Pastes a product image URL and asks for a better/different shot
- Wants 2–4 variants of the same product to A/B test
- Asks to edit a product (add sunglasses, change color, swap
  background) on top of an existing image
- Mentions Shopify, Amazon, Etsy, Meta/Google ads, or "product
  listing"

If there's no input image and the user just wants pure
text-to-image, ProductAI is not the right tool — fall back to a
general image model.

## Picking the right model

| User goal | Model |
|---|---|
| Photoreal re-shoot of a product (default) | `nanobananapro` |
| Edit an existing image (add/remove/swap elements, recolour) | `kontext-pro` |
| Highest-fidelity / complex edits | `kontext-max` |
| Compose from 2–5 reference images | `seedream` or `nanobanana` |
| Quick low-cost draft | `gpt-low` or `gpt-medium` |
| Higher-quality GPT result | `gpt-high` |

Default to `nanobananapro` unless the user explicitly wants to *edit*
something on an existing image — then switch to `kontext-pro`.

## Prompt patterns that work

A great ProductAI prompt names three things:

1. **Surface** — what the product sits on (white marble, light oak
   wood, brushed concrete, dark walnut, beach sand, kitchen counter).
2. **Lighting** — direction + mood ("soft natural daylight from the
   left", "warm golden-hour glow", "studio softbox lit from above").
3. **Composition cue** — one tasteful detail ("slight ground
   reflection", "shallow depth of field", "tight editorial crop",
   "premium minimal look").

Always finish with: *"Preserve the exact shape, colours, materials,
and branding of the product."* This locks the product identity so
ProductAI only changes the scene.

**Good prompt**

> "Place this candle on a dark walnut table, warm evening light from
> a window on the right, slight bokeh, premium editorial look.
> Preserve the exact shape, colours, materials, and branding."

**Avoid**

- Vague directives ("make it look nice", "professional")
- Conflicting cues ("studio AND outdoor", "morning AND sunset")
- Asking ProductAI to change the product itself (use a different
  tool for that)

## When the user wants variants

Use `generate_and_wait` with `count: 3` (or `count: 4`) and return
all completed images so the user can pick a winner. Don't generate
one at a time and call it three times. Each variant consumes one
credit on the user's ProductAI account.

## When a job takes a while

Some models take 20-60 seconds. Always use `wait_for_job` (or
`generate_and_wait`) so the finished image lands inline in the same
turn — don't just hand the user a job ID and stop.

## When the user supplies several reference images

Switch the model to `seedream` (or `nanobanana`) and pass `image_url`
as an array of URLs. Use this for "combine the look of A with the
product in B" requests.

## Errors and edge cases

- **"No active API key" / "Could not provision a ProductAI API key"**:
  rare race; retry the same call once.
- **Credit / quota error**: tell the user to top up at
  `https://create.productai.photo/dashboard`.
- **Upstream timeout**: the job is still running; offer to
  `wait_for_job` with the returned job ID.

## Tool inventory recap

| Tool | When to call |
|---|---|
| `generate_and_wait` | Default. One step, returns finished image(s). |
| `generate_image` | If the user wants the job to run in the background. |
| `wait_for_job` | Resume waiting on a job started earlier. |
| `get_job` | One-shot status check (returns image inline if done). |
