const STYLES: Record<string, string> = {
  SAFE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  GOOD: "bg-lime-500/15 text-lime-400 border-lime-500/30",
  MEDIUM: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  HIGH: "bg-red-500/15 text-red-400 border-red-500/30",
  UNSCORED: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

export default function RiskBadge({ band }: { band: string }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STYLES[band] ?? STYLES.UNSCORED}`}>
      {band}
    </span>
  );
}
