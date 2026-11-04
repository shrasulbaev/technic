import "dotenv/config";
import { run } from "./seed-demo";

run(process.env.DATABASE_URL).catch((e) => {
  console.error(e);
  process.exit(1);
});
