import { useState } from 'react';
import { LogIn } from 'lucide-react';
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
    <div className="grid min-h-screen bg-[#eef2f7] lg:grid-cols-[0.95fr_1.05fr]">
      <section className="relative hidden items-center justify-center overflow-hidden bg-[#101827] px-10 py-12 text-white lg:flex">
        <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(20,184,166,0.16),transparent_42%),linear-gradient(315deg,rgba(15,23,42,0),rgba(15,23,42,0.85))]" />
        <div className="relative max-w-lg">
          <div className="mb-10">
            <StudioLogo />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">Naveen Digital Studio</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight">Order and Production Management</h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-slate-300">
            A focused workspace for custom frame orders, employee assignments, production progress, and studio reports.
          </p>
          <div className="mt-10 h-px w-32 bg-teal-300/60" />
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-10">
        <form onSubmit={handleSubmit} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <StudioLogo dark />
          </div>
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Secure Access</p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">Sign in</h2>
            <p className="mt-2 text-sm text-slate-500">Use your studio admin or production account.</p>
          </div>

          {error && <div className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          <label className="mt-5 block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input type="email" autoComplete="username" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <div className="mt-1">
              <PasswordField value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
          </label>

          <button disabled={loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            <LogIn size={17} />
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
