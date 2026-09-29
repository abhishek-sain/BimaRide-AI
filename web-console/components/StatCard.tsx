export default function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "yellow" | "red" | "blue";
}) {
  const accentClass =
    accent === "green"
      ? "text-emerald-400"
      : accent === "yellow"
      ? "text-amber-400"
      : accent === "red"
      ? "text-red-400"
      : "text-sky-400";

  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5">
      <p className="text-xs tracking-wider uppercase text-slate-500">{label}</p>
      <p className={`text-3xl font-bold mt-2 ${accentClass}`}>{value}</p>
    </div>
  );
}
