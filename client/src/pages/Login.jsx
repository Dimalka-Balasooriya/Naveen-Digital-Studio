import { useState } from 'react';
import { Camera, CheckCircle2, ClipboardList, LogIn, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import StudioLogo from '../components/StudioLogo';
import PasswordField from '../components/PasswordField';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Check the API and credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-[linear-gradient(135deg,#ecfeff_0%,#f8fafc_42%,#fff7ed_100%)] lg:grid-cols-[1fr_1.05fr]">
      <section className="relative hidden items-center justify-center overflow-hidden bg-[linear-gradient(160deg,#0f172a_0%,#123047_58%,#0f766e_128%)] px-10 py-12 text-white lg:flex">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-300 via-cyan-300 to-orange-300" />
        <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(20,184,166,0.18),transparent_42%),linear-gradient(315deg,rgba(15,23,42,0),rgba(15,23,42,0.78))]" />
        <div className="relative max-w-xl">
          <div className="mb-10">
            <StudioLogo />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">Naveen Digital Studio</p>
          <h1 className="mt-4 text-5xl font-bold leading-tight tracking-tight">Order and Production Management</h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-slate-300">
            A focused workspace for custom frame orders, employee assignments, production progress, and studio reports.
          </p>
          <div className="mt-10 grid max-w-md gap-3 sm:grid-cols-3">
            {[
              [ClipboardList, 'Orders'],
              [Users, 'Staff'],
              [Camera, 'Studio']
            ].map(([Icon, label]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-inner shadow-white/5">
                <Icon size={20} className="text-teal-200" />
                <p className="mt-3 text-sm font-semibold">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-10">
        <form onSubmit={handleSubmit} className="w-full max-w-md rounded-3xl border border-white/80 bg-white/95 p-8 shadow-2xl shadow-slate-300/40 backdrop-blur">
          <div className="mb-8 flex justify-center lg:hidden">
            <StudioLogo dark />
          </div>
          <div className="mb-6">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-teal-700 ring-1 ring-teal-100">
              <ShieldCheck size={14} />
              Secure Access
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-slate-950">Sign in</h2>
            <p className="mt-2 text-sm text-slate-500">Use your studio admin or production account.</p>
          </div>

          {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>}

          <label className="mt-5 block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input type="email" autoComplete="username" className="app-focus mt-1 w-full rounded-xl border border-slate-300/90 bg-white px-3.5 py-3 text-sm shadow-sm outline-none transition" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <div className="mt-1">
              <PasswordField value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
          </label>

          <button disabled={loading} className="btn-primary mt-6 w-full py-3.5">
            {loading ? <CheckCircle2 size={17} /> : <LogIn size={17} />}
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
          <p className="mt-6 border-t border-slate-200 pt-4 text-center text-xs leading-5 text-slate-500">
            Copyright {new Date().getFullYear()} Naveen Digital Studio. All rights reserved.
          </p>
        </form>
      </section>
    </div>
  );
}
