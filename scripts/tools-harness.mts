// Dev harness: runs every specialized tool through a real MCP client with
// upstream HTTP stubbed. Usage: npx tsx scripts/tools-harness.mts
process.env.PUBLIC_URL ??= "http://localhost";
process.env.DATABASE_URL ??= "postgres://x@localhost/x";
for (const k of ["AUTH0_DOMAIN", "AUTH0_ISSUER_BASE_URL", "AUTH0_AUDIENCE", "AUTH0_MCP_CLIENT_ID", "AUTH0_MCP_CLIENT_SECRET", "OAUTH_JWT_SECRET"]) process.env[k] ??= "x";

const pg = (await import("pg")).default;
(pg.Pool.prototype as any).query = async () => ({ rows: [{ key: "test-key" }] });

const calls: string[] = [];
const bench = { typical: 52, betterThan: 31, n: 140 };
const stub: Record<string, unknown> = {
  "POST /api/audit/quick": {
    primary: "product",
    store: { status: "ok", mode: "store", store: "candles.co", products: 24, source: "feed", metrics: [{ label: "Photos per product", value: "2.1", bench }], scoreBench: bench, issues: [], strengths: [] },
    product: { status: "ok", mode: "product", store: "candles.co", source: "feed", product: { title: "Amber Candle", url: "u" }, countKnown: true, score: 41, verdict: "Needs work", bench: { score: bench, photos: { typical: 5, betterThan: 10, n: 140 } }, photos: [{ src: "a" }, { src: "b" }], issues: [{ severity: "bad", title: "Only 2 photos", detail: "Shoppers expect 5+." }, { severity: "warn", title: "No lifestyle shot", detail: "All photos are on white." }], strengths: ["Main image on white"] },
  },
  "POST /v1/api/fidelity-check": { status: "OK", data: { verdict: "flagged", category: "text", note: "Label reads 'AMBR' instead of 'AMBER'." } },
  "POST /v1/api/import-product": { status: "OK", data: { product_id: 7, title: "Amber Candle", source_url: "u", assets: [{ id: 1, url: "https://cdn/x1.jpg" }, { id: 2, url: "https://cdn/x2.jpg" }] } },
  "GET /v1/api/products": { status: "OK", data: [{ id: 7, name: "Amber Candle", sku: "AC-1", size: "8cm", cover_url: "https://cdn/x1.jpg", asset_count: 2 }] },
  "POST /v1/api/templates/from-pinterest": { status: "OK", data: { id: 99, title: "Moody walnut", prompt: "On a dark walnut table, warm window light.", cover_url: "https://cdn/pin.jpg", source_url: "p" } },
  "GET /v1/api/templates": { status: "OK", data: [{ id: 5, title: "Marble", prompt: "White marble, soft daylight.", cover_url: "https://cdn/t.jpg" }] },
  "POST /v1/api/onboarding": { status: "OK", data: {} },
  "GET /v1/api/account": { status: "OK", data: { credits: 6, plan: "Free", products_count: 1, onboarding: { needed: true, answers: { category: "home" } } } },
};
globalThis.fetch = (async (input: any, init?: any) => {
  const u = new URL(String(input));
  const key = `${init?.method ?? "GET"} ${u.pathname}`;
  calls.push(`${key}${u.search} ${init?.body ?? ""} ${init?.headers?.["x-api-key"] ? "[api-key]" : ""}`);
  if (u.searchParams.get("fail") || String(init?.body).includes("bad.example")) return new Response("Cannot POST /v1/api/import-product", { status: 404 });
  const body = stub[key];
  return body ? Response.json(body) : new Response("not found", { status: 404 });
}) as typeof fetch;

const { buildMcpServer } = await import("../src/mcp/server.js");
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
const [a, b] = InMemoryTransport.createLinkedPair();
const server = buildMcpServer("1");
await server.connect(a);
const client = new Client({ name: "harness", version: "0" });
await client.connect(b);

console.log("TOOLS:", (await client.listTools()).tools.map((t) => t.name).join(", "));
console.log("PROMPTS:", (await client.listPrompts()).prompts.map((p) => p.name).join(", "));
const run = async (name: string, args: Record<string, unknown>) => {
  const r: any = await client.callTool({ name, arguments: args });
  console.log(`\n===== ${name} ${JSON.stringify(args)}${r.isError ? " [isError]" : ""}\n${r.content.map((c: any) => c.text).join("\n")}`);
};
await run("test_pdp", { url: "https://candles.co/products/amber" });
await run("check_fidelity", { job_id: 123 });
await run("check_fidelity", { render_url: "https://cdn/r.jpg" });
await run("import_products", { urls: ["https://candles.co/products/amber", "https://bad.example/p"] });
await run("list_products", {});
await run("create_template_from_pinterest", { url: "https://pinterest.com/pin/123" });
await run("list_templates", { category: "home" });
await run("start_onboarding", {});
await run("start_onboarding", { answers: { category: "home", priorities: ["ads"] } });
console.log("\nUPSTREAM CALLS:\n" + calls.join("\n"));
process.exit(0);
