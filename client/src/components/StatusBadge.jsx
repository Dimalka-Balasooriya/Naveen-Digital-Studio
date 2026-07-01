import { getStatusStyle, getStatusTone, titleCase } from '../utils/statusDisplay';

export default function StatusBadge({ children, color = 'slate' }) {
  const tone = getStatusTone(color);
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone.badge}`} style={getStatusStyle(color)}>
      {typeof children === 'string' ? titleCase(children) : children}
    </span>
  );
}
