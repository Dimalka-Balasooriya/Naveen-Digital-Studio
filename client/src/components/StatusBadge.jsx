const colorMap = {
  sky: 'bg-sky-100 text-sky-800 ring-sky-200',
  violet: 'bg-violet-100 text-violet-800 ring-violet-200',
  amber: 'bg-amber-100 text-amber-800 ring-amber-200',
  orange: 'bg-orange-100 text-orange-800 ring-orange-200',
  emerald: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  green: 'bg-green-100 text-green-800 ring-green-200',
  rose: 'bg-rose-100 text-rose-800 ring-rose-200',
  slate: 'bg-slate-100 text-slate-800 ring-slate-200'
};

export default function StatusBadge({ children, color = 'slate' }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${colorMap[color] || colorMap.slate}`}>
      {children}
    </span>
  );
}
