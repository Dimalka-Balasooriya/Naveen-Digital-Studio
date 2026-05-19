export default function StatCard({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-950',
    teal: 'border-teal-100 bg-teal-50 text-teal-950',
    orange: 'border-orange-100 bg-orange-50 text-orange-950',
    rose: 'border-rose-100 bg-rose-50 text-rose-950',
    green: 'border-green-100 bg-green-50 text-green-950'
  };

  return (
    <div className={`rounded-md border p-4 ${tones[tone] || tones.slate}`}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value ?? 0}</p>
    </div>
  );
}
