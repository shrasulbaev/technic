// Shared Tailwind class strings.
export const btnPrimary =
  "inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-5 font-extrabold text-accent-ink transition active:scale-[0.98] disabled:opacity-50";
export const btnDark =
  "inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-ink px-5 font-extrabold text-white transition active:scale-[0.98] disabled:opacity-50";
export const btnSecondary =
  "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-5 font-bold text-text transition active:scale-[0.98] disabled:opacity-50";
export const btnDanger =
  "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-5 font-bold text-danger transition active:scale-[0.98] disabled:opacity-50";
export const btnSmall =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-text disabled:opacity-50";
export const input =
  "h-12 w-full rounded-xl border border-line bg-surface px-4 text-text outline-none placeholder:text-muted/70 focus:border-ink";
export const card = "rounded-2xl bg-surface";
export const label = "flex flex-col gap-1.5 text-sm font-semibold text-muted";
export const pill = (active: boolean) =>
  `flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-bold ${active ? "bg-ink text-white" : "border border-line bg-surface text-muted"}`;
