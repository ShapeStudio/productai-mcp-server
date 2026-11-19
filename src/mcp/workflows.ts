import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Named workflows: ready-made multi-step recipes ("/amazon-listing",
 * "/ad-variants", …) that chain the ProductAI tools for one job.
 *
 * Each workflow is served two ways so it works in every client:
 * - as an MCP prompt (a slash command in Claude Code, the + menu in Claude.ai)
 * - via `list_workflows` / `get_workflow`, so a plain message like
 *   "Use ProductAI to run /amazon-listing" (or a claude.ai/new?q= link) works
 *   in clients that don't surface prompts, ChatGPT included.
 *
 * The workflows are pure data: adding one means adding an entry to WORKFLOWS.
 */

export type WorkflowArg = { name: string; description: string };

export type Workflow = {
  /** Slash-command name, kebab-case. */
  slug: string;
  title: string;
  /** One line, shown in prompt pickers and `list_workflows`. */
  summary: string;
  category: "Listings" | "Ads" | "Catalogue" | "Creative" | "Video" | "Audit";
  /** Optional prompt arguments (all strings, all optional). */
  args: WorkflowArg[];
  /** The steps Claude follows. Markdown. */
  steps: string;
  /** A sample request, for docs and landing pages. */
  example: string;
};

const PRODUCT_ARG: WorkflowArg = {
  name: "product",
  description: "Product photo URL or product page link (or attach a photo in the chat)",
};

/** Rules that apply to every workflow; prepended to each one's steps. */
export const COMMON_RULES = `## Ground rules (every workflow)
- **Getting the product photo.** A product page link → \`import_products\` and use the returned photo URLs. A photo URL → use it directly as \`image_url\`. A photo attached in the chat → \`upload_asset\` first. Already in their catalogue → \`list_products\`. No photo at all → ask for one; ProductAI works from a real product photo.
- **Lock the product.** End every image prompt with: "Preserve the exact shape, colours, materials, proportions, text and branding of the product." Only the scene changes.
- **Credits.** Every image and video costs credits on the user's ProductAI account. Before a batch of more than 4 images, or any video, say how many images/clips you're about to make and get a yes.
- **Show the pictures.** Copy the \`![](url)\` image markdown from tool results into your reply so images render inline. Never just say "done" or paste bare links.
- **Quality control.** Run \`check_fidelity\` (free) on each finished image before calling it final. If it's flagged, say what changed and regenerate that one.
- **No AI-rendered claims.** Don't ask the image model to write prices, ratings, certifications or long copy into the picture; leave clean space and write the copy as text for the user to add.
- **Ask little.** Ask only what you can't infer, all in one message, then run. Sensible defaults beat a questionnaire.`;

export const WORKFLOWS: Workflow[] = [
  {
    slug: "amazon-listing",
    title: "Amazon listing image set",
    summary: "One product photo → a compliant main image on white plus secondary listing images.",
    category: "Listings",
    args: [PRODUCT_ARG, { name: "marketplace", description: "Amazon (default), Etsy, eBay, Walmart, Zalando…" }],
    example: "Make a full Amazon listing image set for this water bottle: https://…/bottle.jpg",
    steps: `## Steps
1. Get the product photo (see ground rules). Ask one question only if unclear: what the product is used for and who buys it.
2. **Main image** — \`generate_and_wait\`, model \`nanobananapro\`, count 2: "Product alone on a pure white (#FFFFFF) seamless background, centred, filling about 85% of a square frame, soft even studio light, subtle natural contact shadow, no props, no text, no watermark." Let the user pick one.
3. **Secondary images** — plan 6 and list them before generating (credits rule):
   - Lifestyle: the product in use in its natural setting
   - Scale: held in a hand or next to a familiar object
   - Detail: macro close-up of the best material / feature
   - Feature callout: product on a clean background with empty space on one side for 3 short benefit labels
   - What's in the box / packaging
   - Second lifestyle or use case for a different buyer
   Use \`nanobanana2.1\` for these, square composition.
4. \`check_fidelity\` on every image; redo anything flagged.
5. Deliver an ordered set (1 = main) with each image inline, plus suggested text for the feature-callout labels and 5 bullet points for the listing.
6. For non-Amazon marketplaces keep the same structure; only Amazon strictly requires the pure-white main image.`,
  },
  {
    slug: "ad-variants",
    title: "Ad creative variants",
    summary: "One product → four distinct ad concepts for Meta / TikTok / Google, with copy, ready to A/B test.",
    category: "Ads",
    args: [
      PRODUCT_ARG,
      { name: "platform", description: "Meta (default), TikTok, Pinterest, Google Display" },
      { name: "offer", description: "Offer or angle to push, e.g. '20% off', 'free shipping', 'new launch'" },
    ],
    example: "Make 4 Meta ad variants for this serum, we're running 20% off: https://…/serum.jpg",
    steps: `## Steps
1. Get the product photo. Infer audience and tone from the product; ask only if the offer/platform matter and weren't given.
2. Pick the format from the platform: Meta feed 4:5 vertical, Stories/Reels/TikTok 9:16, Pinterest 2:3, Google Display 1:1. Say the format in every prompt ("vertical 4:5 composition with clean space in the top third for a headline").
3. Generate **four different concepts**, one image each (count 1 per concept, so each has its own prompt):
   - **Hero** — bold product shot on a strong single-colour backdrop that suits the brand
   - **Lifestyle** — the product in the buyer's real life, aspirational but believable
   - **Problem → solution** — a scene that shows the moment the product helps
   - **UGC feel** — casual phone-camera look, natural light, real home setting (model \`nanobanana2.1\`)
4. \`check_fidelity\` on each.
5. For every concept write: headline (≤ 40 chars), primary text (≤ 125 chars), CTA button. Work the offer in if given — as copy, not rendered into the image.
6. Close with a one-line test plan: which two concepts to run first and the metric to judge them (CTR for hooks, CPA for winners).`,
  },
  {
    slug: "shopify-catalog",
    title: "Catalogue refresh",
    summary: "Import several products from links and give each one a consistent, on-brand scene photo.",
    category: "Catalogue",
    args: [
      { name: "links", description: "Product page links, comma or newline separated (up to 10)" },
      { name: "style", description: "Look for the whole set, e.g. 'warm oak + daylight', or a Pinterest pin link" },
    ],
    example: "Refresh the photos for these 6 products with one consistent warm-minimal look: …",
    steps: `## Steps
1. \`import_products\` with the links (up to 10 per call). No links → \`list_products\` and let the user pick.
2. Settle **one** look for the whole set so the catalogue feels consistent:
   - a Pinterest pin → \`create_template_from_pinterest\` and use its prompt
   - a described style → write one scene prompt from it
   - nothing given → \`list_templates\` for their category, suggest 3, let them choose
3. Credits rule: tell the user "N products × 1 image" and get a yes.
4. For each product: \`generate_and_wait\` with its best photo and the shared scene prompt (adapt only scale words: a ring vs a chair). Model \`nanobanana2.1\` unless they asked for top quality (\`nanobananapro\`).
5. \`check_fidelity\` on every result; regenerate flagged ones once, then report any still flagged.
6. Deliver a table: product · new image · fidelity ✓/flag, then all images inline. Mention they can manage the set in the ProductAI dashboard (https://create.productai.photo/dashboard).`,
  },
  {
    slug: "lifestyle-shoot",
    title: "Lifestyle photo shoot",
    summary: "Three distinct lifestyle scenes for one product, then refine the favourite.",
    category: "Creative",
    args: [PRODUCT_ARG, { name: "vibe", description: "Brand mood, e.g. 'Scandinavian calm', 'bold Gen-Z', 'luxury spa'" }],
    example: "Do a lifestyle shoot for this candle, cosy Scandinavian vibe: https://…/candle.jpg",
    steps: `## Steps
1. Get the product photo. If no vibe was given, infer one from the product and state it in one line.
2. Write three clearly different scenes, each naming **surface, light and one composition cue**, e.g. home interior / outdoor or travel / editorial studio set. Show the three one-line scene ideas, then generate.
3. \`generate_and_wait\` once per scene (count 1), model \`nanobananapro\`.
4. \`check_fidelity\` on each.
5. Show all three inline and ask which to push further. On the pick: change only the clause they want changed (light, surface, crop, prop) and run \`count: 2\` for close variations.`,
  },
  {
    slug: "realistic-shot",
    title: "Raw camera realism",
    summary: "An unretouched, straight-out-of-camera look that doesn't read as AI.",
    category: "Creative",
    args: [PRODUCT_ARG, { name: "scene", description: "What should be in the shot, e.g. 'on a bathroom shelf, morning'" }],
    example: "Make this lipstick look like a real phone photo on a messy vanity, not AI: https://…/lipstick.jpg",
    steps: `## Steps
1. Get the product photo.
2. Write **one paragraph** prompt that earns realism through physical evidence, not adjectives:
   - Open with "A straight-out-of-camera close photographic study of…" (never "beautiful / stunning / cinematic / 8k").
   - Plain natural light: overcast window or soft side daylight; slightly imperfect white balance.
   - Surface evidence: fingerprints on glass, dust in creases, fabric lint, faint scratches where things touch, condensation if cold.
   - Ordinary setting with a softly defocused background; real lens behaviour (shallow depth of field, mild compression).
   - Close with negatives: no airbrushing, no CGI smoothness, no glossy beauty lighting, no perfect symmetry, no added text or logos.
   - Then the product-lock sentence.
3. \`generate_and_wait\`, model \`nanobananapro\`, count 2.
4. \`check_fidelity\`, then show both inline with the exact prompt so the user can iterate. On feedback, edit only the relevant clause.
5. People in the shot: adults only, ordinary styling, no identifiable real people.`,
  },
  {
    slug: "product-video",
    title: "Product video clip",
    summary: "Turn a product photo into a short video clip for ads, reels or a product page.",
    category: "Video",
    args: [
      PRODUCT_ARG,
      { name: "use", description: "Where it runs: reels/TikTok (9:16, default), product page (1:1 or 16:9), ad" },
    ],
    example: "Make a 5-second reel of this sneaker rotating on a concrete plinth: https://…/sneaker.jpg",
    steps: `## Steps
1. Get the product photo. If the photo is weak (cluttered, dark), first make a clean hero still with \`generate_and_wait\` and animate that.
2. Pick the aspect ratio from where it runs (reels/TikTok 9:16, product page 1:1, YouTube/web 16:9).
3. Write the video prompt in this order: **camera move** (slow push-in, orbit, top-down reveal) → **what the product does** (rotates, liquid pours, lid opens, fabric moves) → **setting** → **light**. One move per clip; keep it simple.
4. Credits rule: state the clip (e.g. "5 s, 720p, 9:16 ≈ 60 credits on Seedance") and get a yes.
5. \`generate_video\`, model \`seedance\`, 720p, duration 5, \`generate_audio\` true for social use. Then \`wait_for_job\` with \`max_wait_seconds: 300\` (call again if it's still running).
6. Share the video link with the prompt used. Offer 1080p or a second camera move once they like the direction.`,
  },
  {
    slug: "pdp-audit",
    title: "Product page photo audit + fix",
    summary: "Score a product page's photos, then generate the shots it's missing.",
    category: "Audit",
    args: [{ name: "url", description: "Product page or store URL" }],
    example: "Audit the photos on https://store.com/products/amber-candle and fix the gaps",
    steps: `## Steps
1. \`test_pdp\` with the URL (free, ~30 s). Show the score and the top 3 issues in plain words.
2. Map each issue to a shot that fixes it (too few photos → add lifestyle + detail + scale; no lifestyle → lifestyle scene; inconsistent backgrounds → one consistent clean background; no scale → in-hand shot).
3. Offer to make those shots. On yes: \`import_products\` with the product page URL to get its photos, then \`generate_and_wait\` one image per missing shot (credits rule applies).
4. \`check_fidelity\` on each.
5. Deliver the new shots inline in the order they should appear on the page, and say where each one goes (position 2, 3…). For a store URL, audit first and ask which product to fix.`,
  },
  {
    slug: "pinterest-look",
    title: "Recreate a Pinterest look",
    summary: "Turn a Pinterest pin into a reusable scene and put the product in it.",
    category: "Creative",
    args: [PRODUCT_ARG, { name: "pin", description: "Pinterest pin link" }],
    example: "Put our mug in the look of this pin: https://pinterest.com/pin/… — product: https://…/mug.jpg",
    steps: `## Steps
1. \`create_template_from_pinterest\` with the pin (free). It saves a template to their account and returns a scene prompt.
2. Get the product photo.
3. \`generate_and_wait\` with the product photo and the template prompt (plus the product-lock sentence), model \`nanobananapro\`, count 2.
4. \`check_fidelity\`, show both inline next to the pin, and offer to apply the same template to other products (\`list_products\`).`,
  },
  {
    slug: "holiday-campaign",
    title: "Seasonal campaign set",
    summary: "A ready-to-post seasonal set (Black Friday, Christmas, Valentine's…) for one product.",
    category: "Ads",
    args: [
      PRODUCT_ARG,
      { name: "season", description: "Black Friday, Christmas, Valentine's Day, Mother's Day, summer sale… (default: the next one)" },
    ],
    example: "Make a Christmas campaign set for this perfume: https://…/perfume.jpg",
    steps: `## Steps
1. Get the product photo. No season given → use the next major retail moment from today's date and say which.
2. Make **four** images (one prompt each), list them first:
   - **Hero** on a seasonal set (Christmas: warm lights, pine, wrapped gifts; Black Friday: bold dark backdrop with a single strong accent colour)
   - **Gift-ready** — the product wrapped or in a gift box with ribbon, product still clearly visible
   - **Sale banner** — product off-centre with large clean space for the offer text, wide 16:9 composition
   - **Social post** — square, seasonal props, cosy and shareable
3. \`check_fidelity\` on each.
4. Write a short caption + subject line per image (email, Instagram, ad), with the offer as copy rather than in the picture.`,
  },
];

const bySlug = new Map(WORKFLOWS.map((w) => [w.slug, w]));

/** Resolve "amazon-listing", "/amazon-listing", "Amazon Listing", "amazon_listing". */
export function findWorkflow(name: string): Workflow | undefined {
  const slug = name.trim().replace(/^\/+/, "").toLowerCase().replace(/[\s_]+/g, "-");
  return bySlug.get(slug) ?? WORKFLOWS.find((w) => w.title.toLowerCase() === name.trim().toLowerCase());
}

/** The full instructions Claude follows for one workflow, with any arguments filled in. */
export function renderWorkflow(w: Workflow, args: Record<string, string | undefined> = {}): string {
  const given = w.args
    .map((a) => [a.name, args[a.name]?.trim()] as const)
    .filter((e): e is readonly [string, string] => !!e[1]);
  const lines = [`# /${w.slug} · ${w.title}`, "", w.summary, ""];
  if (given.length) {
    lines.push("**Given:**");
    for (const [k, v] of given) lines.push(`- ${k}: ${v}`);
    lines.push("");
  }
  const missing = w.args.filter((a) => !args[a.name]?.trim());
  if (missing.length) {
    lines.push(`**Not given yet** (infer, ask, or use the default): ${missing.map((a) => `${a.name} — ${a.description}`).join("; ")}`, "");
  }
  lines.push(w.steps, "", COMMON_RULES);
  return lines.join("\n");
}

export function renderCatalogue(): string {
  const lines = [
    "## ProductAI workflows",
    "",
    "Run one by name, e.g. \"run /amazon-listing with this photo\". Call `get_workflow` for its steps.",
    "",
    "| Workflow | What it does | Type |",
    "|---|---|---|",
  ];
  for (const w of WORKFLOWS) lines.push(`| \`/${w.slug}\` | ${w.summary} | ${w.category} |`);
  return lines.join("\n");
}

export function registerWorkflows(server: McpServer): void {
  const names = WORKFLOWS.map((w) => w.slug);

  server.registerTool(
    "list_workflows",
    {
      title: "List ProductAI workflows",
      description:
        "List ProductAI's ready-made workflows (e.g. /amazon-listing, /ad-variants, /shopify-catalog, /product-video). " +
        "Call it when the user asks what ProductAI can do or which workflows exist. Free.",
      annotations: { title: "List ProductAI workflows", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: {},
    },
    async () => ({ content: [{ type: "text" as const, text: renderCatalogue() }] })
  );

  server.registerTool(
    "get_workflow",
    {
      title: "Run a ProductAI workflow",
      description:
        "Get the step-by-step instructions for a named ProductAI workflow, then follow them with the other ProductAI tools. " +
        "Call this FIRST whenever the user names a workflow (\"run /amazon-listing\", \"use the ad-variants workflow\") or their request clearly matches one: " +
        names.map((n) => `/${n}`).join(", ") +
        ". Free; it only returns instructions.",
      annotations: { title: "Run a ProductAI workflow", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: {
        name: z.string().describe(`Workflow name, with or without the slash: ${names.join(", ")}`),
        inputs: z
          .record(z.string())
          .optional()
          .describe("Anything the user already gave, e.g. { product: 'https://…/photo.jpg', platform: 'TikTok' }"),
      },
    },
    async ({ name, inputs }) => {
      const w = findWorkflow(name);
      if (!w) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `There's no workflow called "${name}".\n\n${renderCatalogue()}` }],
        };
      }
      return { content: [{ type: "text" as const, text: renderWorkflow(w, inputs ?? {}) }] };
    }
  );

  for (const w of WORKFLOWS) {
    const argsSchema = Object.fromEntries(w.args.map((a) => [a.name, z.string().optional().describe(a.description)]));
    server.registerPrompt(
      w.slug,
      { title: w.title, description: w.summary, argsSchema },
      (args: Record<string, string | undefined>) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Run the ProductAI /${w.slug} workflow for me, following these instructions.\n\n${renderWorkflow(w, args)}`,
            },
          },
        ],
      })
    );
  }
}
