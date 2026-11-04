import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  redirect(homeFor(await getSession()));
}
