function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Defensive: someone set PUBLIC_URL=mcp.productai.photo without the scheme.
  return `https://${trimmed}`;
}

export const config = {
  port: Number(optional("PORT", "8080")),
  publicUrl: normalizeUrl(required("PUBLIC_URL")),
  productaiApiBase: optional("PRODUCTAI_API_BASE", "https://api.productai.photo/v1").replace(/\/$/, ""),
  databaseUrl: required("DATABASE_URL"),
  auth0: {
    domain: required("AUTH0_DOMAIN"),
    issuerBaseUrl: normalizeUrl(required("AUTH0_ISSUER_BASE_URL")),
    audience: required("AUTH0_AUDIENCE"),
    mcpClientId: required("AUTH0_MCP_CLIENT_ID"),
    mcpClientSecret: required("AUTH0_MCP_CLIENT_SECRET"),
  },
  oauth: {
    jwtSecret: required("OAUTH_JWT_SECRET"),
    accessTokenTtl: Number(optional("OAUTH_ACCESS_TOKEN_TTL", "3600")),
    refreshTokenTtl: Number(optional("OAUTH_REFRESH_TOKEN_TTL", "2592000")),
  },
} as const;
