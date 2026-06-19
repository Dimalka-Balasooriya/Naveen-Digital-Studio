export default function StudioLogo({ compact = false, dark = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`${compact ? 'h-10 w-10' : 'h-12 w-12'} flex shrink-0 items-center justify-center overflow-hidden rounded-full border ${dark ? 'border-slate-200 bg-white' : 'border-white/20 bg-white'} shadow-sm`}>
        <img src="/naveen-digital-studio-logo.jpeg" alt="Naveen Digital Studio logo" className="h-full w-full scale-[1.85] object-cover" />
      </div>
      {!compact ? (
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.28em] ${dark ? 'text-teal-700' : 'text-teal-200'}`}>Naveen</p>
          <h1 className={`text-xl font-semibold leading-tight ${dark ? 'text-slate-950' : 'text-white'}`}>Digital Studio</h1>
        </div>
      ) : null}
    </div>
  );
}
