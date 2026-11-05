import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { productaiRequest } from "../productai.js";

/**
 * Workflow tools on top of the raw generate/job tools: PDP check, fidelity
 * check, product import, guided onboarding and Pinterest templates.
 * Each one is a thin call to a relum-api `/api/*` route (or, for the PDP
 * check, the public site's audit route) plus markdown rendering.
 */

type Text = { type: "text"; text: string };
type Image = { type: "image"; data: string; mimeType: string };
type Content = Text | Image;

const text = (t: string): Text => ({ type: "text", text: t });
const fail = (t: string) => ({ isError: true, content: [text(t)] });

const ONBOARDING_CATEGORIES = [
  "beauty",
  "fashion",
  "fragrance",
  "home",
  "food",
  "jewelry",
  "electronics",
  "sport",
  "accessories",
  "other",
] as const;

const MAX_IMPORT_URLS = 10;

// The audit has no AI cost, but it emails the team and hits customer stores,
// so keep each account to a sensible pace.
const PDP_CHECKS_PER_HOUR = 10;
const pdpChecks = new Map<string, number[]>();

export function registerSpecializedTools(server: McpServer, userId: string): void {
  // ── PDP check ──────────────────────────────────────────────────────────
  server.registerTool(
    "test_pdp",
    {
      title: "Check a product page's photos",
      description:
        "Score the product photos on a product detail page (PDP) or a whole store and list what to fix. " +
        "Give a product page URL to check that product, or a store URL to check the catalogue. " +
        "Works best on Shopify stores; other platforms may come back as 'needs a manual review'. " +
        "Free (no credits) and takes ~20–35s. Follow up by importing the product (`import_products`) and generating better shots.",
      annotations: {
        title: "Check a product page's photos",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        url: z.string().url().describe("Product page URL (e.g. https://store.com/products/candle) or store homepage URL"),
      },
    },
    async ({ url }) => {
      if (!takePdpSlot(userId)) {
        return fail(`You've run ${PDP_CHECKS_PER_HOUR} page checks in the last hour. Try again a little later.`);
      }
      try {
        const res = await auditQuick(url);
        return { content: [text(renderAudit(res, url))] };
      } catch (err) {
        return fail(`Page check failed: ${errMsg(err)}`);
      }
    }
  );

  // ── Fidelity check ────────────────────────────────────────────────────
  server.registerTool(
    "check_fidelity",
    {
      title: "Check the product stayed the same",
      description:
        "Compare a generated photo with the original product photo(s) and flag any change to the product itself — " +
        "altered text or logo, wrong colour, changed shape, missing part, wrong size, or a different product. " +
        "Pass `job_id` for a ProductAI generation (the original reference is looked up automatically), " +
        "or `render_url` plus `reference_urls` for any image. Free (no credits); takes ~5–15s. " +
        "Run it on finished generations before the user publishes them.",
      annotations: {
        title: "Check the product stayed the same",
        readOnlyHint: false, // stores the verdict on the job when job_id is given
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        job_id: z.number().int().optional().describe("ProductAI job id of the generated image to check"),
        render_url: z.string().url().optional().describe("URL of the generated image (when there's no job_id)"),
        reference_urls: z
          .array(z.string().url())
          .min(1)
          .max(5)
          .optional()
          .describe("1–5 URLs of the original product photos. Required with render_url; optional with job_id."),
        description: z.string().optional().describe("Optional product description (name, material, text on the label) to help the check"),
        size: z.string().optional().describe("Optional real-world product size, e.g. '30ml bottle, 9cm tall'"),
      },
    },
    async ({ job_id, render_url, reference_urls, description, size }) => {
      if (job_id == null && !render_url) return fail("Pass either `job_id` or `render_url`.");
      if (job_id == null && !reference_urls?.length) {
        return fail("`reference_urls` (the original product photos) is required when checking a `render_url`.");
      }
      try {
        const body: Record<string, unknown> = {};
        if (job_id != null) body.job_id = job_id;
        if (render_url) body.render_url = render_url;
        if (reference_urls) body.reference_urls = reference_urls;
        if (description) body.description = description;
        if (size) body.size = size;
        const res = (await productaiRequest(userId, "POST", "/api/fidelity-check", body)) as Envelope<FidelityResult>;
        return { content: [text(renderFidelity(res.data, job_id ?? render_url!))] };
      } catch (err) {
        return fail(`Fidelity check failed: ${apiErr(err)}`);
      }
    }
  );

  // ── Product import ────────────────────────────────────────────────────
  server.registerTool(
    "import_products",
    {
      title: "Import products from links",
      description:
        "Import products into the user's ProductAI catalogue from product page links (Shopify works best; other stores via their page metadata). " +
        "Each product's photos are saved and hosted, so the returned image URLs can go straight into `generate_and_wait` as `image_url`. " +
        `Up to ${MAX_IMPORT_URLS} links per call. Importing the same link again returns the existing product. Free (no credits).`,
      annotations: {
        title: "Import products from links",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        urls: z
          .array(z.string().url())
          .min(1)
          .max(MAX_IMPORT_URLS)
          .describe(`Product page URLs to import (1–${MAX_IMPORT_URLS})`),
      },
    },
    async ({ urls }) => {
      // Small concurrency: each import downloads and re-hosts up to 9 images.
      const results = await mapLimit(urls, 3, async (url) => {
        try {
          const res = (await productaiRequest(userId, "POST", "/api/import-product", { url })) as Envelope<ImportedProduct>;
          return { url, ok: true as const, product: res.data };
        } catch (err) {
          return { url, ok: false as const, error: apiErr(err) };
        }
      });
      return { content: [text(renderImports(results))] };
    }
  );

  server.registerTool(
    "list_products",
    {
      title: "List catalogue products",
      description:
        "List the products already in the user's ProductAI catalogue (newest first), with a cover image URL you can pass to `generate_and_wait`.",
      annotations: {
        title: "List catalogue products",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        limit: z.number().int().min(1).max(50).default(20),
      },
    },
    async ({ limit }) => {
      try {
        const res = (await productaiRequest(userId, "GET", `/api/products?limit=${limit}`)) as Envelope<CatalogProduct[]>;
        return { content: [text(renderProducts(res.data ?? []))] };
      } catch (err) {
        return fail(`Could not list products: ${apiErr(err)}`);
      }
    }
  );

  // ── Templates ─────────────────────────────────────────────────────────
  server.registerTool(
    "create_template_from_pinterest",
    {
      title: "Create a template from a Pinterest pin",
      description:
        "Turn a Pinterest pin (pinterest.com/pin/…, pin.it/…, or an i.pinimg.com image) into a reusable ProductAI scene template. " +
        "ProductAI reads the pin's image and writes a scene prompt from it; the template is saved to the user's account (also visible in the dashboard). " +
        "To use it, call `generate_and_wait` with the product photo as `image_url` and the returned prompt. Free (no credits); takes ~10s.",
      annotations: {
        title: "Create a template from a Pinterest pin",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        url: z.string().url().describe("Pinterest pin URL"),
      },
    },
    async ({ url }) => {
      try {
        const res = (await productaiRequest(userId, "POST", "/api/templates/from-pinterest", { url })) as Envelope<PinTemplate>;
        const t = res.data;
        if (!t) return fail("The template was created but nothing came back. Check your saved templates in the dashboard.");
        const lines = [
          `**Template saved** · "${t.title ?? "Untitled"}" · id \`${t.id}\``,
          "",
          t.cover_url ? `![Pin](${t.cover_low_res_url ?? t.cover_url})` : "",
          "",
          "**Scene prompt**",
          `> ${t.prompt ?? "(no prompt)"}`,
          "",
          "Next: run `generate_and_wait` with the product photo as `image_url` and this prompt " +
            "(add \"Preserve the exact shape, colours, materials, and branding of the product.\").",
        ];
        return { content: [text(lines.filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"))] };
      } catch (err) {
        return fail(`Could not create a template from that pin: ${apiErr(err)}`);
      }
    }
  );

  server.registerTool(
    "list_templates",
    {
      title: "Browse scene templates",
      description:
        "List ProductAI scene templates with their prompts and cover images. Filter by product `category`, or set `mine: true` " +
        "for the user's own saved templates (including ones made from Pinterest pins). Use a template by passing its prompt to `generate_and_wait`.",
      annotations: {
        title: "Browse scene templates",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        category: z.enum(ONBOARDING_CATEGORIES).optional().describe("Product category"),
        mine: z.boolean().default(false).describe("Only the user's own saved templates"),
        limit: z.number().int().min(1).max(24).default(8),
      },
    },
    async ({ category, mine, limit }) => {
      try {
        const qs = new URLSearchParams({ limit: String(limit), mine: String(mine) });
        // "other" has no template category; show everything instead.
        if (category && category !== "other") qs.set("category", category);
        const res = (await productaiRequest(userId, "GET", `/api/templates?${qs}`)) as Envelope<TemplateItem[]>;
        return { content: [text(renderTemplates(res.data ?? [], mine, category))] };
      } catch (err) {
        return fail(`Could not list templates: ${apiErr(err)}`);
      }
    }
  );

  // ── Onboarding ────────────────────────────────────────────────────────
  server.registerTool(
    "start_onboarding",
    {
      title: "Get started with ProductAI",
      description:
        "Guided first run for new ProductAI users, or anyone who asks how to get started. Returns the account's state " +
        "(credits, products, what they sell) and the next step to walk the user through: learn what they sell → import a product " +
        "(or upload a photo) → pick a scene → generate a first photo → check it. Call it again with `answers` once the user has said what they sell, to save that.",
      annotations: {
        title: "Get started with ProductAI",
        readOnlyHint: false, // saves answers when given
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        answers: z
          .object({
            category: z.enum(ONBOARDING_CATEGORIES).describe("What the user sells"),
            category_other: z.string().optional().describe("Free text when category is 'other'"),
            priorities: z.array(z.string()).optional().describe("What they want to make, e.g. 'listing photos', 'ads', 'social posts', 'video'"),
          })
          .optional()
          .describe("Save the user's answers. Omit on the first call."),
      },
    },
    async ({ answers }) => {
      try {
        if (answers) {
          await productaiRequest(userId, "POST", "/api/onboarding", {
            answers: {
              category: answers.category,
              categoryOther: answers.category_other ?? null,
              priorities: answers.priorities ?? [],
              features: [],
            },
          });
        }
        const res = (await productaiRequest(userId, "GET", "/api/account")) as Envelope<Account>;
        return { content: [text(renderOnboarding(res.data, answers?.category))] };
      } catch (err) {
        return fail(`Could not load the account: ${apiErr(err)}`);
      }
    }
  );

  server.registerPrompt(
    "get_started",
    {
      title: "Get started with ProductAI",
      description: "Walk me through my first ProductAI product photo.",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "I'm new to ProductAI. Use the start_onboarding tool and walk me through making my first product photo, one step at a time.",
          },
        },
      ],
    })
  );
}

// ── API calls ────────────────────────────────────────────────────────────

async function auditQuick(url: string): Promise<AuditResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.auditServerKey) headers["x-productai-server-key"] = config.auditServerKey;
  const res = await fetch(`${config.auditApiBase}/api/audit/quick`, {
    method: "POST",
    headers,
    body: JSON.stringify({ url, source: "mcp" }),
    signal: AbortSignal.timeout(55_000),
  });
  if (res.status === 429) throw new Error("the checker is busy right now — try again in a few minutes");
  if (res.status === 400) throw new Error("that doesn't look like a store or product page URL");
  if (!res.ok) throw new Error(`checker returned ${res.status}`);
  return (await res.json()) as AuditResponse;
}

function takePdpSlot(userId: string): boolean {
  const now = Date.now();
  const recent = (pdpChecks.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= PDP_CHECKS_PER_HOUR) {
    pdpChecks.set(userId, recent);
    return false;
  }
  recent.push(now);
  pdpChecks.set(userId, recent);
  return true;
}

// ── rendering ────────────────────────────────────────────────────────────

function renderAudit(r: AuditResponse, url: string): string {
  const primary = r.primary === "store" ? r.store : r.product ?? r.store;
  if (!primary) return `No result came back for ${url}.`;
  if (primary.status === "manual") {
    const why =
      primary.reason === "not_shopify"
        ? "it isn't a Shopify store, so the automatic check can't read its catalogue"
        : primary.reason === "blocked"
          ? "the store blocks automated visits"
          : "the page couldn't be reached";
    return (
      `**Couldn't check ${primary.store ?? url} automatically** — ${why}.\n\n` +
      "You can still request a free manual audit at https://www.productai.photo/free-visual-audit, " +
      "or share a few product photo URLs and I'll review them here."
    );
  }

  const lines: string[] = [];
  const heading = primary.mode === "product" && primary.product?.title ? `"${primary.product.title}"` : primary.store ?? url;
  lines.push(`## Photo check · ${heading}`);
  lines.push("");
  const bench = primary.mode === "store" ? primary.scoreBench : primary.bench?.score;
  lines.push(`**Score: ${primary.score ?? "?"}/100**${primary.verdict ? ` — ${primary.verdict}` : ""}`);
  if (bench) {
    lines.push(
      `_Better than ${bench.betterThan}% of the ${bench.n} ${primary.mode === "store" ? "stores" : "product pages"} we've checked (typical score ${bench.typical})._`
    );
  }
  if (primary.mode === "store") {
    if (primary.products != null) lines.push(`_${primary.products} products checked${primary.total ? ` of ${primary.total}` : ""}._`);
    if (primary.metrics?.length) {
      lines.push("");
      lines.push("| Metric | This store | Typical |");
      lines.push("|---|---|---|");
      for (const m of primary.metrics) lines.push(`| ${m.label} | ${m.value} | ${m.bench ? m.bench.typical : "—"} |`);
    }
  } else if (primary.photos && primary.countKnown !== false) {
    const n = primary.photos.length;
    const typical = primary.bench?.photos?.typical;
    lines.push(`_${n} photo${n === 1 ? "" : "s"} on the page${typical != null ? ` (typical: ${typical})` : ""}._`);
  }

  const issues = primary.issues ?? [];
  if (issues.length) {
    lines.push("");
    lines.push("**What to fix**");
    for (const i of issues) {
      const sev = i.severity === "bad" ? "🔴 " : i.severity === "warn" ? "🟠 " : "";
      lines.push(`- ${sev}${i.title}${i.detail ? ` — ${i.detail}` : ""}`);
    }
  }
  const strengths = primary.strengths ?? [];
  if (strengths.length) {
    lines.push("");
    lines.push("**What's working**");
    for (const s of strengths) lines.push(`- ${s}`);
  }
  // A store check also returns the product result when a product URL was given, and vice versa.
  if (r.primary === "store" && r.product?.status === "ok" && r.product.score != null) {
    lines.push("");
    lines.push(`_Product page score: ${r.product.score}/100._`);
  }
  lines.push("");
  lines.push(
    "Next: `import_products` with the product link, then generate improved shots (e.g. a clean main image on white plus lifestyle scenes)."
  );
  return lines.join("\n");
}

function renderFidelity(d: FidelityResult | undefined, subject: number | string): string {
  if (!d) return "The check ran but returned no verdict.";
  const label = typeof subject === "number" ? `job ${subject}` : "this image";
  if (d.verdict === "ok") {
    return `✅ **Product looks unchanged** in ${label}.${d.note ? `\n\n${d.note}` : ""}`;
  }
  const cat = d.category ? CATEGORY_LABEL[d.category] ?? d.category : "change";
  return (
    `⚠️ **Flagged: ${cat}** in ${label}.\n\n${d.note ?? ""}\n\n` +
    "Suggest regenerating — keep the same scene, and add to the prompt exactly what must stay (e.g. the label text, colour, or part that changed). " +
    "`gpt-2.5-precise` or `nanobananapro` keep products most faithfully."
  ).trim();
}

const CATEGORY_LABEL: Record<string, string> = {
  text: "text or logo changed",
  colour: "colour changed",
  shape: "shape changed",
  missing_part: "a part is missing",
  wrong_product: "a different product",
  size: "size looks wrong",
  other: "product changed",
};

type ImportResult =
  | { url: string; ok: true; product?: ImportedProduct }
  | { url: string; ok: false; error: string };

function renderImports(results: ImportResult[]): string {
  const ok = results.filter((r) => r.ok);
  const lines = [`**Imported ${ok.length} of ${results.length} product${results.length === 1 ? "" : "s"}**`, ""];
  for (const r of results) {
    if (!r.ok) {
      lines.push(`### ✗ ${r.url}`);
      lines.push(`_${r.error}_`);
      lines.push("");
      continue;
    }
    const p = r.product;
    const assets = p?.assets ?? [];
    lines.push(`### ${p?.title ?? r.url}${p?.product_id != null ? ` · product \`${p.product_id}\`` : ""}`);
    if (assets[0]) lines.push(`![${p?.title ?? "product"}](${assets[0].url})`);
    if (assets.length) {
      lines.push(`${assets.length} photo${assets.length === 1 ? "" : "s"} saved:`);
      for (const a of assets) lines.push(`- \`${a.url}\``);
    } else {
      lines.push("_No usable photos found on that page._");
    }
    lines.push("");
  }
  if (ok.length) {
    lines.push("Pass a photo URL (or several of the same product) as `image_url` to `generate_and_wait`.");
  }
  return lines.join("\n");
}

function renderProducts(items: CatalogProduct[]): string {
  if (!items.length) return "No products in the catalogue yet. Use `import_products` with a product page link, or `upload_asset` with a photo.";
  const lines = [`**${items.length} product${items.length === 1 ? "" : "s"}**`, ""];
  for (const p of items) {
    const meta = [p.sku ? `SKU ${p.sku}` : "", p.size ?? "", `${p.asset_count ?? 0} photos`].filter(Boolean).join(" · ");
    lines.push(`- **${p.name}** (id \`${p.id}\`) — ${meta}${p.cover_url ? `\n  cover: \`${p.cover_url}\`` : ""}`);
  }
  return lines.join("\n");
}

function renderTemplates(items: TemplateItem[], mine: boolean, category?: string): string {
  if (!items.length) {
    return mine
      ? "No saved templates yet. Make one from a Pinterest pin with `create_template_from_pinterest`."
      : `No templates found${category ? ` for ${category}` : ""}.`;
  }
  const head = mine ? "Your templates" : `Templates${category ? ` · ${category}` : ""}`;
  const lines = [`**${head}** (${items.length})`, ""];
  for (const t of items) {
    lines.push(`### ${t.title ?? "Untitled"} · id \`${t.id}\``);
    if (t.cover_url) lines.push(`![${t.title ?? "template"}](${t.cover_url})`);
    if (t.prompt) lines.push(`> ${t.prompt}`);
    lines.push("");
  }
  lines.push("Use one by passing its prompt and the product photo to `generate_and_wait`.");
  return lines.join("\n");
}

function renderOnboarding(a: Account | undefined, justSaved?: string): string {
  const credits = a?.credits ?? null;
  const products = a?.products_count ?? 0;
  const category = justSaved ?? (a?.onboarding?.answers?.category as string | undefined);

  const lines: string[] = ["## Getting started with ProductAI", ""];
  lines.push(
    `**Account:** ${credits != null ? `${credits} credits` : "credits unknown"}` +
      `${a?.plan ? ` · ${a.plan} plan` : ""} · ${products} product${products === 1 ? "" : "s"} in the catalogue` +
      `${category ? ` · sells **${category}**` : ""}`
  );
  if (justSaved) lines.push("_Saved what you sell — templates and suggestions will match it._");
  lines.push("");

  // Pick the first step the user hasn't done yet.
  let step: string;
  if (!category) {
    step =
      "**Step 1 — what do you sell?** Ask the user in one short question (beauty, fashion, fragrance, home, food, jewelry, " +
      "electronics, sport, accessories, or other) and what they mostly need (listing photos, ads, social posts, video). " +
      "Then call `start_onboarding` again with `answers`.";
  } else if (products === 0) {
    step =
      "**Step 2 — add a product.** Ask for a product page link and run `import_products`, " +
      "or ask them to attach a product photo and run `upload_asset`. One product is enough to start.";
  } else {
    step =
      `**Step 3 — first photo.** Run \`list_templates\` with category \`${category}\` and show 3–4 scenes, ` +
      "or ask for a Pinterest pin of a look they like (`create_template_from_pinterest`). " +
      "Then `generate_and_wait` with the product photo and the chosen prompt (2 variants is a good start). " +
      "Finish with `check_fidelity` on the result so they see the product stayed exact.";
  }
  lines.push(step);
  lines.push("");
  lines.push("**The full path**");
  lines.push("1. What you sell → 2. Add a product (link or photo) → 3. Pick a scene → 4. Generate → 5. Check the product stayed exact");
  if (credits != null && credits < 10) {
    lines.push("");
    lines.push(
      "_Low on credits: a photo costs 5–10 credits. Top up or pick a plan at https://create.productai.photo._"
    );
  }
  lines.push("");
  lines.push("_Guide the user one step at a time; keep questions short and don't list every tool._");
  return lines.join("\n");
}

// ── helpers ──────────────────────────────────────────────────────────────

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    })
  );
  return out;
}

/** Turn relum-api errors into something a user can act on. */
function apiErr(err: unknown): string {
  const msg = errMsg(err);
  const m = /^ProductAI API error \((\d+)\): ([\s\S]*)$/.exec(msg);
  if (!m) return msg;
  const status = Number(m[1]);
  let detail = m[2]!.trim();
  try {
    const j = JSON.parse(detail) as { message?: string; error?: string };
    detail = j.message ?? j.error ?? detail;
  } catch {
    /* plain-text body */
  }
  if (status === 429) return "too many requests — wait a minute and try again";
  if (status === 402) return "not enough credits — top up at https://create.productai.photo";
  if (status === 404 && /cannot (get|post)/i.test(detail)) return "this feature isn't available on the API yet";
  return detail.length > 300 ? `${detail.slice(0, 300)}…` : detail;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── API shapes ───────────────────────────────────────────────────────────

interface Envelope<T> {
  status?: string;
  data?: T;
}
interface FidelityResult {
  verdict: "ok" | "flagged";
  category?: string | null;
  note?: string | null;
}
interface ImportedProduct {
  product_id?: number | null;
  title?: string;
  description?: string;
  source_url?: string;
  assets?: { id: number; url: string }[];
}
interface CatalogProduct {
  id: number;
  name: string;
  sku?: string | null;
  size?: string | null;
  source_url?: string | null;
  cover_url?: string | null;
  asset_count?: number;
}
interface PinTemplate {
  id: number;
  title?: string;
  prompt?: string;
  cover_url?: string;
  cover_low_res_url?: string;
  source_url?: string;
}
interface TemplateItem {
  id: number;
  title?: string;
  prompt?: string;
  cover_url?: string;
  category?: string;
}
interface Account {
  credits?: number;
  plan?: string | null;
  products_count?: number;
  onboarding?: { needed?: boolean; answers?: Record<string, unknown> | null };
}

// Mirrors pai-frontend app/api/audit/quick/route.ts (+ lib/audit/bench.ts).
type Bench = { typical: number; betterThan: number; n: number };
type AuditIssue = { severity?: string; title: string; detail?: string };
type AuditStrength = string;
type AuditManual = { status: "manual"; store?: string; reason?: "blocked" | "not_shopify" | "unreachable" };
type AuditProduct = {
  status: "ok";
  mode: "product";
  store?: string;
  product?: { title?: string; url?: string };
  score?: number;
  verdict?: string;
  countKnown?: boolean;
  bench?: { score: Bench | null; photos: Bench | null };
  photos?: { src: string }[];
  issues?: AuditIssue[];
  strengths?: AuditStrength[];
};
type AuditStore = {
  status: "ok";
  mode: "store";
  store?: string;
  score?: number;
  verdict?: string;
  products?: number;
  total?: number;
  metrics?: { label: string; value: string; bench?: Bench | null }[];
  scoreBench?: Bench | null;
  issues?: AuditIssue[];
  strengths?: AuditStrength[];
};
type AuditResult = AuditManual | AuditProduct | AuditStore;
interface AuditResponse {
  primary?: "store" | "product";
  store?: AuditResult | null;
  product?: AuditResult | null;
}
