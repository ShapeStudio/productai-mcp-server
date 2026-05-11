import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { query } from "../db.js";
import { config } from "../config.js";
import { verifyAuth0Token } from "./tokens.js";

export const callbackRouter = Router();

const CallbackQuery = z.object({
  code: z.string(),
  state: z.string(),
});

// Auth0 redirects the user here after they log in. We exchange Auth0's code
// for an Auth0 access token, identify the user, and then issue our own
// one-time MCP authorization code which Claude will exchange at /oauth/token.
callbackRouter.get("/oauth/callback", async (req, res) => {
  const parsed = CallbackQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).type("html").send(htmlError("Invalid callback", parsed.error.message));
    return;
  }
  const { code, state: txid } = parsed.data;

  const txRes = await query<{
    txid: string;
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: string;
    scope: string;
    client_state: string | null;
    expires_at: string;
  }>(
    `select * from mcp_oauth_transactions where txid = $1 and expires_at > now()`,
    [txid]
  );
  const tx = txRes.rows[0];
  if (!tx) {
    res.status(400).type("html").send(htmlError("Authorization session expired", "Please start the connection again."));
    return;
  }
  // One-time use
  await query(`delete from mcp_oauth_transactions where txid = $1`, [txid]);

  // Exchange Auth0 code → Auth0 access + id tokens
  const tokenRes = await fetch(`${config.auth0.issuerBaseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: config.auth0.mcpClientId,
      client_secret: config.auth0.mcpClientSecret,
      code,
      redirect_uri: `${config.publicUrl}/oauth/callback`,
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    res.status(502).type("html").send(htmlError("Auth0 token exchange failed", text));
    return;
  }
  const tokens = (await tokenRes.json()) as { access_token: string; id_token?: string };

  // Verify the access token and pull out the Auth0 sub.
  let auth0Sub: string;
  let email: string | undefined;
  try {
    const verified = await verifyAuth0Token(tokens.access_token);
    auth0Sub = verified.sub;
    email = verified.email;
  } catch (err) {
    res.status(502).type("html").send(htmlError("Auth0 token verification failed", String(err)));
    return;
  }

  // Resolve relum users.id from auth0Id
  const userRes = await query<{ id: number; email: string | null }>(
    `select id, email from "Users" where "auth0Id" = $1`,
    [auth0Sub]
  );
  const user = userRes.rows[0];
  if (!user) {
    res
      .status(403)
      .type("html")
      .send(
        htmlError(
          "No ProductAI account found",
          "Sign up first at https://create.productai.photo, then re-try connecting from Claude."
        )
      );
    return;
  }

  // Issue our own one-time MCP authorization code
  const mcpCode = randomBytes(32).toString("base64url");
  await query(
    `insert into mcp_oauth_codes (code, client_id, user_id, auth0_sub, user_email, redirect_uri, code_challenge, code_challenge_method, scope, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + interval '5 minutes')`,
    [
      mcpCode,
      tx.client_id,
      String(user.id),
      auth0Sub,
      email ?? user.email,
      tx.redirect_uri,
      tx.code_challenge,
      tx.code_challenge_method,
      tx.scope,
    ]
  );

  // Bounce back to Claude with the MCP code
  const redirect = new URL(tx.redirect_uri);
  redirect.searchParams.set("code", mcpCode);
  if (tx.client_state) redirect.searchParams.set("state", tx.client_state);
  res.redirect(302, redirect.toString());
});

function htmlError(title: string, detail: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<body style="font-family:system-ui;padding:40px;max-width:600px;margin:auto">
<h1 style="margin:0 0 8px">${esc(title)}</h1>
<p style="color:#666;white-space:pre-wrap">${esc(detail)}</p>
</body>`;
}
