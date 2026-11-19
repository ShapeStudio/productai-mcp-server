import { test } from "node:test";
import assert from "node:assert/strict";

// Config needs these to load; nothing here touches the network or DB.
process.env.PUBLIC_URL ??= "http://localhost";
process.env.DATABASE_URL ??= "postgres://x@localhost/x";
for (const k of ["AUTH0_DOMAIN", "AUTH0_ISSUER_BASE_URL", "AUTH0_AUDIENCE", "AUTH0_MCP_CLIENT_ID", "AUTH0_MCP_CLIENT_SECRET", "OAUTH_JWT_SECRET"]) {
  process.env[k] ??= "x";
}

const { buildMcpServer } = await import("../src/mcp/server.js");
const { WORKFLOWS, findWorkflow } = await import("../src/mcp/workflows.js");
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await buildMcpServer("1").connect(a);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(b);
  return client;
}

const textOf = (r: any) => r.content.map((c: any) => c.text).join("\n");

test("workflow slugs are unique kebab-case", () => {
  const slugs = WORKFLOWS.map((w) => w.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of slugs) assert.match(s, /^[a-z]+(-[a-z]+)*$/);
});

test("findWorkflow accepts slash, case, spaces and underscores", () => {
  assert.equal(findWorkflow("/amazon-listing")?.slug, "amazon-listing");
  assert.equal(findWorkflow("Amazon Listing")?.slug, "amazon-listing");
  assert.equal(findWorkflow("amazon_listing")?.slug, "amazon-listing");
  assert.equal(findWorkflow("nope"), undefined);
});

test("every workflow is exposed as a prompt, and get_started is kept", async () => {
  const client = await connect();
  const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
  for (const w of WORKFLOWS) assert.ok(prompts.includes(w.slug), `missing prompt ${w.slug}`);
  assert.ok(prompts.includes("get_started"));
});

test("server instructions mention the workflows", async () => {
  const client = await connect();
  const ins = client.getInstructions() ?? "";
  assert.match(ins, /\/amazon-listing/);
  assert.match(ins, /get_workflow/);
});

test("prompt fills in given arguments and the ground rules", async () => {
  const client = await connect();
  const r = await client.getPrompt({ name: "ad-variants", arguments: { product: "https://cdn/x.jpg", platform: "TikTok" } });
  const t = (r.messages[0].content as any).text as string;
  assert.match(t, /\/ad-variants/);
  assert.match(t, /- product: https:\/\/cdn\/x\.jpg/);
  assert.match(t, /- platform: TikTok/);
  assert.match(t, /Not given yet.*offer/);
  assert.match(t, /Ground rules/);
});

test("get_workflow returns steps; unknown name lists the catalogue", async () => {
  const client = await connect();
  const ok: any = await client.callTool({ name: "get_workflow", arguments: { name: "/Product Video", inputs: { use: "reels" } } });
  assert.ok(!ok.isError);
  assert.match(textOf(ok), /generate_video/);
  assert.match(textOf(ok), /- use: reels/);

  const bad: any = await client.callTool({ name: "get_workflow", arguments: { name: "unicorn" } });
  assert.equal(bad.isError, true);
  assert.match(textOf(bad), /\/amazon-listing/);
});

test("list_workflows lists every workflow", async () => {
  const client = await connect();
  const r: any = await client.callTool({ name: "list_workflows", arguments: {} });
  for (const w of WORKFLOWS) assert.match(textOf(r), new RegExp(`/${w.slug}`));
});

test("workflow steps only reference tools that exist", async () => {
  const client = await connect();
  const tools = new Set((await client.listTools()).tools.map((t) => t.name));
  for (const w of WORKFLOWS) {
    for (const m of w.steps.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) {
      if (m[1] === "max_wait_seconds" || m[1] === "generate_audio" || m[1] === "image_url") continue;
      assert.ok(tools.has(m[1]), `/${w.slug} mentions unknown tool ${m[1]}`);
    }
  }
});
