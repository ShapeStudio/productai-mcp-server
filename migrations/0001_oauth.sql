-- Run against the same Postgres that hosts relum-api (DATABASE_URL).
--
--   psql "$DATABASE_URL" -f migrations/0001_oauth.sql
--

create table if not exists mcp_oauth_clients (
  client_id text primary key,
  client_secret_hash text,
  client_name text not null default 'MCP Client',
  redirect_uris text[] not null,
  token_endpoint_auth_method text not null default 'none',
  scope text not null default 'mcp',
  created_at timestamptz not null default now()
);

-- Short-lived: holds the original Claude PKCE request while the user
-- bounces through Auth0's hosted login. Cleared on callback.
create table if not exists mcp_oauth_transactions (
  txid text primary key,
  client_id text not null references mcp_oauth_clients(client_id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  scope text not null default 'mcp',
  client_state text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists mcp_oauth_transactions_expires_idx
  on mcp_oauth_transactions (expires_at);

-- Short-lived authorization codes Claude exchanges at /oauth/token.
create table if not exists mcp_oauth_codes (
  code text primary key,
  client_id text not null references mcp_oauth_clients(client_id) on delete cascade,
  user_id text not null,
  auth0_sub text not null,
  user_email text,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  scope text not null default 'mcp',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists mcp_oauth_codes_expires_idx
  on mcp_oauth_codes (expires_at);
