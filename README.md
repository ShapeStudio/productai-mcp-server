# productai-mcp-server

Remote MCP server for **ProductAI**, deployable to **DigitalOcean App Platform**. Auth is delegated to your existing **Auth0** tenant (`productai.eu.auth0.com`). Upstream API calls hit **relum-api** with each user's per-account `x-api-key`.

> Sibling project to [ShapeStudio/productai-mcp](https://github.com/ShapeStudio/productai-mcp) — that one is the local **stdio** server. This one is the **remote HTTP** server that can be submitted to Anthropic's Connectors directory.

## Architecture

```
Claude  ──OAuth─▶  productai-mcp-server  ──OAuth (RS256)──▶  Auth0
                          │
                          │ on tool call:
                          │   1. lookup Users.auth0Id → users.id
                          │   2. lookup ApiKeys.key (active, latest) for users.id
                          │   3. call relum-api/api/* with x-api-key
                          ▼
                  api.productai.photo (relum-api)
```

We are the OAuth provider exposed to Claude (with RFC 7591 Dynamic Client Registration, PKCE S256), but we delegate the actual user authentication to Auth0. After Auth0 returns, we mint our own short-lived HS256 JWTs.

## Endpoints

| Path | Purpose |
|---|---|
| `GET /healthz` | Liveness |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 (MCP discovery) |
| `POST /oauth/register` | Dynamic Client Registration |
| `GET /oauth/authorize` | Validates PKCE request, redirects user to Auth0 |
| `GET /oauth/callback` | Auth0 redirects here; we mint an MCP code |
| `POST /oauth/token` | `authorization_code` + `refresh_token` grants |
| `ALL /mcp` | Streamable HTTP MCP transport (Bearer required) |

## Tools

| Tool | Read-only? | Description |
|---|---|---|
| `generate_image` | no | Start a generation job |
| `generate_and_wait` | no | Generate + poll until complete |
| `get_job` | yes | Status of a job |
| `wait_for_job` | yes | Poll an existing job until done |

All tools carry MCP `annotations` (`title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) — required by Anthropic Connectors review.

## One-time Auth0 setup

1. In `productai.eu.auth0.com` dashboard, **Applications → Create Application → Regular Web Application**, name it `ProductAI MCP`.
2. In its **Settings**:
   - **Allowed Callback URLs**: `https://mcp.productai.photo/oauth/callback`
   - **Allowed Logout URLs**: `https://mcp.productai.photo`
   - **Token Endpoint Authentication Method**: `Post`
3. **APIs → relum-api → Machine to Machine Applications → ProductAI MCP**: authorize, leave scopes blank.
4. Grab the **Client ID** and **Client Secret** — those become `AUTH0_MCP_CLIENT_ID` / `AUTH0_MCP_CLIENT_SECRET`.

## DB migration

Connect to the same Postgres as relum-api:

```bash
psql "$DATABASE_URL" -f migrations/0001_oauth.sql
```

This creates three new tables: `mcp_oauth_clients`, `mcp_oauth_transactions`, `mcp_oauth_codes`. The existing `Users` / `ApiKeys` tables are read but not modified.

## Local dev

```bash
cp .env.example .env  # fill in the real values
npm install
npm run dev
BASE=http://localhost:8080 npm run test:smoke
```

For the full OAuth dance locally, point Auth0's callback at `http://localhost:8080/oauth/callback` (use `ngrok` if Auth0 rejects loopback).

## Deploy to DigitalOcean App Platform

1. Push this repo to GitHub at `ShapeStudio/productai-mcp-server`.
2. DigitalOcean → Apps → **Create App** → from GitHub. DO detects `.do/app.yaml`.
3. Fill in the four `SECRET` env vars in the DO console:
   - `AUTH0_MCP_CLIENT_ID`, `AUTH0_MCP_CLIENT_SECRET`
   - `DATABASE_URL` (same as relum-api)
   - `OAUTH_JWT_SECRET` — `openssl rand -base64 64`
4. Settings → Domains → add `mcp.productai.photo`.
5. Verify: `curl https://mcp.productai.photo/.well-known/oauth-authorization-server`

## Submitting to Anthropic's Connectors directory

Once deployed and live:

1. Run through https://claude.com/docs/connectors/building/review-criteria
2. Submit: https://clau.de/mcp-directory-submission

Required collateral:
- Public docs page (link or blog post) covering setup + use cases
- Logo + favicon
- Privacy policy URL
- Test account credentials for Anthropic review

## License

MIT
