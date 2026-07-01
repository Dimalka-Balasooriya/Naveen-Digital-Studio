export const statusColorMap = {
  sky: {
    badge: 'bg-sky-100 text-sky-800 ring-sky-200',
    dot: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 ring-sky-200'
  },
  blue: {
    badge: 'bg-blue-100 text-blue-800 ring-blue-200',
    dot: 'bg-blue-500',
    chip: 'bg-blue-50 text-blue-700 ring-blue-200'
  },
  cyan: {
    badge: 'bg-cyan-100 text-cyan-800 ring-cyan-200',
    dot: 'bg-cyan-500',
    chip: 'bg-cyan-50 text-cyan-700 ring-cyan-200'
  },
  teal: {
    badge: 'bg-teal-100 text-teal-800 ring-teal-200',
    dot: 'bg-teal-500',
    chip: 'bg-teal-50 text-teal-700 ring-teal-200'
  },
  emerald: {
    badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  },
  green: {
    badge: 'bg-green-100 text-green-800 ring-green-200',
    dot: 'bg-green-500',
    chip: 'bg-green-50 text-green-700 ring-green-200'
  },
  lime: {
    badge: 'bg-lime-100 text-lime-800 ring-lime-200',
    dot: 'bg-lime-500',
    chip: 'bg-lime-50 text-lime-700 ring-lime-200'
  },
  yellow: {
    badge: 'bg-yellow-100 text-yellow-800 ring-yellow-200',
    dot: 'bg-yellow-500',
    chip: 'bg-yellow-50 text-yellow-700 ring-yellow-200'
  },
  amber: {
    badge: 'bg-amber-100 text-amber-800 ring-amber-200',
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700 ring-amber-200'
  },
  orange: {
    badge: 'bg-orange-100 text-orange-800 ring-orange-200',
    dot: 'bg-orange-500',
    chip: 'bg-orange-50 text-orange-700 ring-orange-200'
  },
  rose: {
    badge: 'bg-rose-100 text-rose-800 ring-rose-200',
    dot: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 ring-rose-200'
  },
  red: {
    badge: 'bg-red-100 text-red-800 ring-red-200',
    dot: 'bg-red-500',
    chip: 'bg-red-50 text-red-700 ring-red-200'
  },
  pink: {
    badge: 'bg-pink-100 text-pink-800 ring-pink-200',
    dot: 'bg-pink-500',
    chip: 'bg-pink-50 text-pink-700 ring-pink-200'
  },
  fuchsia: {
    badge: 'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200',
    dot: 'bg-fuchsia-500',
    chip: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200'
  },
  purple: {
    badge: 'bg-purple-100 text-purple-800 ring-purple-200',
    dot: 'bg-purple-500',
    chip: 'bg-purple-50 text-purple-700 ring-purple-200'
  },
  violet: {
    badge: 'bg-violet-100 text-violet-800 ring-violet-200',
    dot: 'bg-violet-500',
    chip: 'bg-violet-50 text-violet-700 ring-violet-200'
  },
  indigo: {
    badge: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
    dot: 'bg-indigo-500',
    chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200'
  },
  slate: {
    badge: 'bg-slate-100 text-slate-800 ring-slate-200',
    dot: 'bg-slate-500',
    chip: 'bg-slate-50 text-slate-700 ring-slate-200'
  }
};

export const statusHexPalette = [
  '#64748B',
  '#0EA5E9',
  '#10B981',
  '#8B5CF6',
  '#06B6D4',
  '#F59E0B',
  '#84CC16',
  '#2563EB',
  '#14B8A6',
  '#F97316',
  '#A855F7',
  '#6366F1',
  '#EC4899',
  '#D946EF',
  '#F43F5E',
  '#EAB308',
  '#22C55E',
  '#0D9488',
  '#0891B2',
  '#3B82F6',
  '#7C3AED',
  '#D97706',
  '#EA580C',
  '#DB2777',
  '#16A34A',
  '#DC2626'
];

export function isHexColor(value = '') {
  return /^#[0-9a-f]{6}$/i.test(String(value).trim());
}

export function titleCase(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function getStatusTone(color = 'slate') {
  return statusColorMap[String(color || 'slate').trim().toLowerCase()] || statusColorMap.slate;
}

export function getStatusStyle(color = 'slate') {
  const normalized = String(color || 'slate').trim();
  if (!isHexColor(normalized)) return {};

  return {
    backgroundColor: `${normalized}1A`,
    color: normalized,
    borderColor: `${normalized}66`,
    '--tw-ring-color': `${normalized}66`
  };
}
