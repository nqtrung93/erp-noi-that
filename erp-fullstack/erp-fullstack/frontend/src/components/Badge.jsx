export default function Badge({ label, colorClass = "bg-slate-100 text-slate-600" }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}>{label}</span>;
}
