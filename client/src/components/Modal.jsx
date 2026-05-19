import { X } from 'lucide-react';

export default function Modal({ title, open, onClose, children }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4">
      <div className="mt-10 w-full max-w-3xl rounded-md bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          <button onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
