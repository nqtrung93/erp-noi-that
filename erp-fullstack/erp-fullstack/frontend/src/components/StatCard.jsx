export default function StatCard({ icon, label, value, sub, color = "bg-slate-50" }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center text-lg mb-2`}>{icon}</div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-400">{label}{sub ? ` \u00b7 ${sub}` : ""}</div>
    </div>
  );
}
