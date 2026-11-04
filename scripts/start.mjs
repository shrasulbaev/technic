// Production entrypoint: apply migrations, optionally seed demo data, then
// run the Next.js server.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

for (let i = 1; ; i++) {
  try {
    await pool.query("select 1");
    break;
  } catch (e) {
    if (i >= 30) throw e;
    console.log("waiting for database…");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
console.log("migrations applied");
await pool.end();

if (process.env.SEED_DEMO === "1") {
  const { run } = await import("../dist/seed-demo.mjs");
  await run(process.env.DATABASE_URL);
}

await import("../server.js");
