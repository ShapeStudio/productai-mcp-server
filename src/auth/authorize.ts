import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { query } from "../db.js";
import { config } from "../config.js";

export const authorizeRouter = Router();

const AuthorizeQuery = z.object({
  response_type: z.literal("code"),
  client_id: z.string(),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
  state: z.string().optional(),
  scope: z.string().optional(),
});

// Claude (the MCP client) hits /oauth/authorize. We validate the request,
// stash it server-side keyed by a one-time `txid`, and redirect the user
// to Auth0 for actual authentication. Auth0 will call us back on /oauth/callback.
authorizeRouter.get("/oauth/authorize", async (req, res) => {
  const parsed = AuthorizeQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).type("html").send(errorPage("Invalid authorization request", parsed.error.message));
    return;
  }
  const q = parsed.data;

  const { rows } = await query<{
    client_id: string;
    redirect_uris: string[];
    client_name: string;
  }>("select client_id, redirect_uris, client_name from mcp_oauth_clients where client_id = $1", [q.client_id]);
  const client = rows[0];
  if (!client) {
    res.status(400).type("html").send(errorPage("Unknown client", `client_id=${q.client_id}`));
    return;
  }
  if (!client.redirect_uris.includes(q.redirect_uri)) {
    res.status(400).type("html").send(errorPage("Invalid redirect_uri", "Not registered for this client"));
    return;
  }

  const txid = randomBytes(24).toString("base64url");
  await query(
    `insert into mcp_oauth_transactions (txid, client_id, redirect_uri, code_challenge, code_challenge_method, scope, client_state, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, now() + interval '10 minutes')`,
    [
      txid,
      q.client_id,
      q.redirect_uri,
      q.code_challenge,
      q.code_challenge_method,
      q.scope ?? "mcp",
      q.state ?? null,
    ]
  );

  const auth0 = new URL(`${config.auth0.issuerBaseUrl}/authorize`);
  auth0.searchParams.set("response_type", "code");
  auth0.searchParams.set("client_id", config.auth0.mcpClientId);
  auth0.searchParams.set("redirect_uri", `${config.publicUrl}/oauth/callback`);
  auth0.searchParams.set("scope", "openid email profile offline_access");
  auth0.searchParams.set("audience", config.auth0.audience);
  auth0.searchParams.set("state", txid);

  res.redirect(302, auth0.toString());
});

function errorPage(title: string, detail: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<body style="font-family:system-ui;padding:40px;max-width:600px;margin:auto">
<h1 style="margin:0 0 8px">${esc(title)}</h1>
<p style="color:#666">${esc(detail)}</p>
</body>`;
}
