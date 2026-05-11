#!/usr/bin/env node
// Quick smoke test against a running server. Usage: BASE=http://localhost:8080 node scripts/smoke.mjs
const BASE = process.env.BASE ?? "http://localhost:8080";

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  console.log(`GET ${path} →`, res.status);
  console.log(await res.text());
  console.log("---");
}

await get("/healthz");
await get("/.well-known/oauth-authorization-server");
await get("/.well-known/oauth-protected-resource");

const reg = await fetch(`${BASE}/oauth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    client_name: "Smoke Test",
    redirect_uris: ["http://localhost:3000/callback"],
    token_endpoint_auth_method: "none",
  }),
});
console.log("POST /oauth/register →", reg.status);
console.log(await reg.text());
