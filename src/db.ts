import pg from "pg";
import { config } from "./config.js";

export const db = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
  max: 8,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<pg.QueryResult<T>> {
  return db.query<T>(text, params as never);
}
