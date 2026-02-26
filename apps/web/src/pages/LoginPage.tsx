// =============================================================================
// Medgnosis Web — Login  (Clinical Obsidian v2)
// Atmospheric animated grid + centered auth card
// =============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuthStore } from '../stores/auth.js';
import { api } from '../services/api.js';
import type { User, AuthTokens } from '@medgnosis/shared';

export function LoginPage() {
  const navigate       = useNavigate();
  const { setAuth }    = useAuthStore();
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email    = formData.get('email')    as string;
    const password = formData.get('password') as string;

    try {
      const res = await api.post<{ user: User; tokens: AuthTokens }>('/auth/login', {
        email,
        password,
      });

      if (res.data) {
        setAuth(res.data.user, res.data.tokens);
        navigate('/dashboard');
      } else {
        setError(res.error?.message ?? 'Login failed');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-void flex items-center justify-center relative overflow-hidden">

      {/* ── Keyframe animations ─────────────────────────────────────────── */}
      <style>{`
        @keyframes login-blob-1 {
          0%, 100% { transform: translate(0px,  0px) scale(1);    }
          33%       { transform: translate(40px,-25px) scale(1.06); }
          66%       { transform: translate(-20px,15px) scale(0.96); }
        }
        @keyframes login-blob-2 {
          0%, 100% { transform: translate(0px,   0px) scale(1);  }
          50%       { transform: translate(-35px,20px) scale(1.1); }
        }
        @keyframes login-grid-pulse {
          0%, 100% { opacity: 0.028; }
          50%       { opacity: 0.048; }
        }
        .login-blob-1 { animation: login-blob-1 22s ease-in-out infinite; }
        .login-blob-2 { animation: login-blob-2 30s ease-in-out infinite; }
        .login-grid   { animation: login-grid-pulse 12s ease-in-out infinite; }
      `}</style>

      {/* ── Atmospheric background ──────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">

        {/* Teal glow — top center */}
        <div
          className="login-blob-1 absolute -top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[550px] rounded-full blur-[130px]"
          style={{ background: 'radial-gradient(ellipse, rgba(13,217,217,0.055) 0%, transparent 70%)' }}
        />

        {/* Violet glow — bottom right */}
        <div
          className="login-blob-2 absolute -bottom-1/4 -right-1/6 w-[700px] h-[500px] rounded-full blur-[110px]"
          style={{ background: 'radial-gradient(ellipse, rgba(107,86,255,0.04) 0%, transparent 70%)' }}
        />

        {/* Subtle grid lines */}
        <div
          className="login-grid absolute inset-0"
          style={{
            backgroundImage: [
              'linear-gradient(rgba(13,217,217,0.055) 1px, transparent 1px)',
              'linear-gradient(90deg, rgba(13,217,217,0.055) 1px, transparent 1px)',
            ].join(', '),
            backgroundSize: '52px 52px',
          }}
        />

        {/* Radial vignette — fades grid at edges */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 75% 65% at center, transparent 25%, #050D1A 100%)',
          }}
        />
      </div>

      {/* ── Card ────────────────────────────────────────────────────────── */}
      <div className="w-full max-w-[392px] mx-4 z-10 animate-fade-up">

        {/* Logo block */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-teal/10 border border-teal/20 mb-4"
            style={{ boxShadow: '0 0 24px rgba(13,217,217,0.14)' }}
          >
            <span className="font-ui font-bold text-sm text-teal tracking-tight">MG</span>
          </div>
          <h1 className="text-xl font-semibold text-bright font-ui tracking-tight">
            Medgnosis
          </h1>
          <p className="text-xs text-ghost mt-1 font-ui tracking-wide">
            Population Health Management
          </p>
        </div>

        {/* Auth card */}
        <div className="surface p-7">
          <h2 className="text-base font-semibold text-bright mb-0.5">Welcome back</h2>
          <p className="text-sm text-dim mb-6">Sign in to your clinical workspace</p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-dim mb-1.5"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input-field w-full"
                placeholder="clinician@hospital.org"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-dim mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="input-field w-full"
                placeholder="••••••••"
              />
            </div>

            {/* Error banner */}
            {error && (
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-card bg-crimson/8 border border-crimson/20 text-xs text-crimson animate-fade-up"
                role="alert"
              >
                <AlertCircle size={13} strokeWidth={2} className="flex-shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center mt-1"
            >
              {loading ? (
                <>
                  <span
                    className="inline-block w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin"
                    aria-hidden="true"
                  />
                  <span>Signing in…</span>
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        {/* System status footer */}
        <div className="flex items-center justify-center gap-2 mt-5">
          <span className="live-dot" aria-hidden="true" />
          <span className="text-xs text-ghost font-ui">All systems operational</span>
        </div>
      </div>
    </div>
  );
}
