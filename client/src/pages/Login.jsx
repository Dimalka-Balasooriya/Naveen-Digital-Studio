import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@naveendigitalstudio.com');
  const [password, setPassword] = useState('password123');
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
    <div className="grid min-h-screen bg-slate-100 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="flex items-center justify-center bg-studio-panel px-6 py-12 text-white">
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-200">Naveen Digital Studio</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">Order and Production Management</h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            Manage custom frame orders, employee assignments, production progress, reminders, and daily studio performance from one focused dashboard.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <form onSubmit={handleSubmit} className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-950">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use an admin or production account.</p>

          {error && <div className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          <label className="mt-5 block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input type="password" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>

          <button disabled={loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-studio-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
            <LogIn size={17} />
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </div>
  );
}
