export function Logo({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 text-lg font-extrabold ${dark ? "text-white" : "text-text"}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#15171C" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z" />
          <circle cx="6" cy="17.5" r="2" fill="#F5B700" />
          <circle cx="17" cy="17.5" r="2" fill="#F5B700" />
        </svg>
      </span>
      <span className={compact ? "hidden sm:inline" : ""}>Technic</span>
    </span>
  );
}
