// Runs once per server process: every minute releases unconfirmed scheduled
// orders (with the penalty) and closes stale searches.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "test") return;
  const g = globalThis as unknown as { backgroundStarted?: boolean };
  if (g.backgroundStarted) return;
  g.backgroundStarted = true;
  const { sweep } = await import("@/server/orders");
  setInterval(() => {
    sweep().catch((e) => console.error("sweep failed", e));
  }, 60_000);
}
