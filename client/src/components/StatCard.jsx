export default function StatCard({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-950 after:bg-slate-400',
    teal: 'border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50 text-teal-950 after:bg-teal-500',
    orange: 'border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 text-orange-950 after:bg-orange-500',
    rose: 'border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50 text-rose-950 after:bg-rose-500',
    green: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-lime-50 text-emerald-950 after:bg-emerald-500'
  };

  return (
    <div className={`relative overflow-hidden rounded-xl border p-5 shadow-sm shadow-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-md after:absolute after:inset-x-0 after:top-0 after:h-1 ${tones[tone] || tones.slate}`}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value ?? 0}</p>
    </div>
  );
}
