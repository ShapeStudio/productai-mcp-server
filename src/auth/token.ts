import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { query } from "../db.js";
import { signAccessToken, signRefreshToken, verifyMcpToken, type McpClaims } from "./tokens.js";
import { config } from "../config.js";

export const tokenRouter = Router();

const TokenBody = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string(),
    redirect_uri: z.string().url(),
    client_id: z.string(),
    client_secret: z.string().optional(),
    code_verifier: z.string().min(43).max(128),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string(),
    client_id: z.string(),
    client_secret: z.string().optional(),
  }),
]);

interface ClientRow {
  client_id: string;
  client_secret_hash: string | null;
  token_endpoint_auth_method: string;
}

async function loadClient(clientId: string): Promise<ClientRow | undefined> {
  const r = await query<ClientRow>(
    "select client_id, client_secret_hash, token_endpoint_auth_method from mcp_oauth_clients where client_id = $1",
    [clientId]
  );
  return r.rows[0];
}

function verifyClientSecret(client: ClientRow, presentedSecret: string | undefined): boolean {
  if (client.token_endpoint_auth_method !== "client_secret_post") return true;
  if (!presentedSecret) return false;
  const hash = createHash("sha256").update(presentedSecret).digest("hex");
  return hash === client.client_secret_hash;
}

tokenRouter.post("/oauth/token", async (req, res) => {
  const parsed = TokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", error_description: parsed.error.message });
    return;
  }
  const body = parsed.data;

  const client = await loadClient(body.client_id);
  if (!client) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }
  if (!verifyClientSecret(client, body.client_secret)) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }

  if (body.grant_type === "authorization_code") {
    const r = await query<{
      code: string;
      client_id: string;
      user_id: string;
      auth0_sub: string;
      user_email: string | null;
      redirect_uri: string;
      code_challenge: string;
      scope: string;
      expires_at: string;
    }>("select * from mcp_oauth_codes where code = $1", [body.code]);
    const row = r.rows[0];
    if (!row) {
      res.status(400).json({ error: "invalid_grant", error_description: "Code not found or already used" });
      return;
    }
    if (row.client_id !== body.client_id || row.redirect_uri !== body.redirect_uri) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
    if (new Date(row.expires_at) < new Date()) {
      res.status(400).json({ error: "invalid_grant", error_description: "Code expired" });
      return;
    }
    // PKCE verification (S256)
    const computed = createHash("sha256").update(body.code_verifier).digest("base64url");
    if (computed !== row.code_challenge) {
      res.status(400).json({ error: "invalid_grant", error_description: "PKCE mismatch" });
      return;
    }
    await query("delete from mcp_oauth_codes where code = $1", [body.code]);

    const claims: McpClaims = {
      sub: row.user_id,
      auth0_sub: row.auth0_sub,
      client_id: row.client_id,
      scope: row.scope,
      email: row.user_email ?? undefined,
    };
    const access_token = await signAccessToken(claims);
    const refresh_token = await signRefreshToken(claims);
    res.json({
      access_token,
      token_type: "Bearer",
      expires_in: config.oauth.accessTokenTtl,
      refresh_token,
      scope: row.scope,
    });
    return;
  }

  // refresh_token grant
  try {
    const claims = await verifyMcpToken(body.refresh_token, "refresh");
    if (claims.client_id !== body.client_id) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
    const access_token = await signAccessToken(claims);
    const refresh_token = await signRefreshToken(claims);
    res.json({
      access_token,
      token_type: "Bearer",
      expires_in: config.oauth.accessTokenTtl,
      refresh_token,
      scope: claims.scope,
    });
  } catch {
    res.status(400).json({ error: "invalid_grant", error_description: "Refresh token invalid or expired" });
  }
});
