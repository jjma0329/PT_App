import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken, isAuthenticated } from '../../lib/auth';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already logged in, skip straight to admin dashboard
  useEffect(() => {
    if (isAuthenticated()) navigate('/admin', { replace: true });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json() as { success: boolean; data?: { token: string }; error?: string };

      if (!res.ok || !json.success) {
        setError(json.error ?? 'Login failed. Please try again.');
        return;
      }

      setToken(json.data!.token);
      navigate('/admin', { replace: true });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo / title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-white tracking-tight">JJM Fitness</h1>
          <p className="text-zinc-400 text-sm mt-1">Admin Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-zinc-800 rounded-2xl p-8 flex flex-col gap-5">

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-zinc-300 text-sm font-medium">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="bg-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-yellow-400 placeholder-zinc-500"
              placeholder="trainer@example.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-zinc-300 text-sm font-medium">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="bg-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-900 font-bold rounded-lg py-2.5 text-sm transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

        </form>
      </div>
    </div>
  );
}
