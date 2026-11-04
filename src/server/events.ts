import { pool } from "@/db/client";

// Events only carry ids; screens re-read what they show.
// `users`: who must hear it; `drivers`: every driver on the line (new order in the feed).
export type AppEvent = {
  type: "order" | "offer" | "location" | "feed" | "wallet";
  orderId?: string;
  users?: string[];
  drivers?: boolean;
};

export const CHANNEL = "technic_events";

export async function publish(event: AppEvent) {
  await pool().query("select pg_notify($1, $2)", [CHANNEL, JSON.stringify(event)]);
}
