import { useState, type FormEvent } from 'react';
import { ShieldCheck, LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
    } catch {
      setError('Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div
        className="brutal-card p-8 w-full max-w-sm"
        style={{ boxShadow: '6px 6px 0px #7c3aed' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-[#7c3aed] border-2 border-white" style={{ boxShadow: '3px 3px 0px #fff' }}>
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <span className="font-mono text-lg font-black tracking-tight text-white uppercase">
            DRM<span className="text-[#7c3aed]">Shield</span>
          </span>
        </div>

        <h1 className="text-xl font-black text-white uppercase tracking-wide mb-1">Sign In</h1>
        <p className="text-gray-500 text-xs font-mono mb-6">Credentials required to access secure library.</p>

        {error && (
          <div className="flex items-center gap-2 bg-[#ef4444]/10 border-2 border-[#ef4444] px-3 py-2 mb-5">
            <AlertCircle className="w-4 h-4 text-[#ef4444] shrink-0" />
            <span className="text-[#ef4444] text-xs font-mono">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="bg-[#111] border-2 border-white/20 text-white font-mono text-sm px-3 py-2 outline-none focus:border-[#7c3aed] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="bg-[#111] border-2 border-white/20 text-white font-mono text-sm px-3 py-2 outline-none focus:border-[#7c3aed] transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="brutal-btn mt-2 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t-2 border-white/10 flex items-center justify-center gap-2 opacity-80">
          <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Built by</span>
          <img src="/arqx-logo.png" alt="ARQX" className="h-3.5 w-auto" />
          <span className="text-[10px] text-gray-300 font-mono uppercase tracking-[0.2em] font-black">Atlas</span>
        </div>
      </div>
    </div>
  );
}
