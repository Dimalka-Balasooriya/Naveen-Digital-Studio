import { X } from 'lucide-react';

export default function Modal({ title, open, onClose, children, zIndex = 'z-40' }) {
  if (!open) return null;

  return (
    <div className={`fixed inset-0 ${zIndex} flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm`}>
      <div className="mt-10 w-full max-w-3xl overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl shadow-slate-950/20">
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-white via-teal-50/60 to-cyan-50/60 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-slate-950 hover:shadow-sm" title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
