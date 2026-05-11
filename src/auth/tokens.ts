import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { config } from "../config.js";

const secret = new TextEncoder().encode(config.oauth.jwtSecret);
const ISSUER = "productai-mcp";

// JWKS for verifying Auth0-issued JWTs (used during the OAuth callback exchange).
// MCP tokens issued to Claude are HS256-signed by us.
const auth0Jwks = createRemoteJWKSet(new URL(`${config.auth0.issuerBaseUrl}/.well-known/jwks.json`));

export interface McpClaims {
  sub: string;            // relum users.id (numeric, stringified)
  auth0_sub: string;      // Auth0 user id (e.g. "auth0|abc123")
  client_id: string;
  scope: string;
  email?: string;
}

export async function signAccessToken(claims: McpClaims): Promise<string> {
  return new SignJWT({ ...claims, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${config.oauth.accessTokenTtl}s`)
    .sign(secret);
}

export async function signRefreshToken(claims: McpClaims): Promise<string> {
  return new SignJWT({ ...claims, typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${config.oauth.refreshTokenTtl}s`)
    .sign(secret);
}

export async function verifyMcpToken(token: string, expectedType: "access" | "refresh"): Promise<McpClaims> {
  const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
  if (payload.typ !== expectedType) throw new Error(`expected ${expectedType} token`);
  return {
    sub: payload.sub as string,
    auth0_sub: payload.auth0_sub as string,
    client_id: payload.client_id as string,
    scope: payload.scope as string,
    email: payload.email as string | undefined,
  };
}

export async function verifyAuth0Token(token: string): Promise<{ sub: string; email?: string }> {
  const { payload } = await jwtVerify(token, auth0Jwks, {
    issuer: `${config.auth0.issuerBaseUrl}/`,
    audience: config.auth0.audience,
  });
  return { sub: payload.sub as string, email: payload.email as string | undefined };
}
