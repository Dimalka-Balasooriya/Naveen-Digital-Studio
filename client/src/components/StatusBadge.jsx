const colorMap = {
  sky: 'bg-sky-100 text-sky-800',
  violet: 'bg-violet-100 text-violet-800',
  amber: 'bg-amber-100 text-amber-800',
  orange: 'bg-orange-100 text-orange-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  green: 'bg-green-100 text-green-800',
  rose: 'bg-rose-100 text-rose-800',
  slate: 'bg-slate-100 text-slate-800'
};

export default function StatusBadge({ children, color = 'slate' }) {
  return (
    <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${colorMap[color] || colorMap.slate}`}>
      {children}
    </span>
  );
}
