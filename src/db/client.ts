import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { pool?: Pool; db?: Db };

export function pool(): Pool {
  globalForDb.pool ??= new Pool({ connectionString: env().DATABASE_URL, max: 10 });
  return globalForDb.pool;
}

export function db(): Db {
  globalForDb.db ??= drizzle(pool(), { schema });
  return globalForDb.db;
}
