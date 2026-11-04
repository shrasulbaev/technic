export function Flash({ err }: { err?: string }) {
  if (!err) return null;
  return <p role="alert" className="rounded-2xl bg-warn-bg px-4 py-3 text-sm font-bold text-warn">{err}</p>;
}
