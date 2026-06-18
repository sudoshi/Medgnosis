import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { api, apiErrorMessage } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import type { OidcExchangeResponse } from '@medgnosis/shared';

export function OidcCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setAuth } = useAuthStore();
  const exchanged = useRef(false);
  const [error, setError] = useState('');
  const code = params.get('code');

  useEffect(() => {
    if (!code || exchanged.current) return;
    exchanged.current = true;

    api.post<OidcExchangeResponse>('/auth/oidc/exchange', { code })
      .then((res) => {
        if (!res.data) {
          throw new Error(res.error?.message ?? 'Single sign-on failed');
        }
        setAuth(res.data.user, res.data.tokens);
        navigate('/dashboard', { replace: true });
      })
      .catch((err: unknown) => {
        setError(apiErrorMessage(err, 'Single sign-on failed'));
      });
  }, [code, navigate, setAuth]);

  if (!code) {
    return <Navigate to="/login?oidc_error=missing_code" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-void px-4">
      <div className="surface max-w-sm p-6 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-card bg-[var(--primary-bg)] text-[var(--primary)]">
          <ShieldCheck size={22} strokeWidth={1.7} />
        </div>
        <h1 className="text-lg font-semibold text-bright">Completing sign-in</h1>
        <p className="mt-2 text-sm text-ghost">
          {error || 'Verifying your Medgnosis session...'}
        </p>
        {error && (
          <button
            type="button"
            className="mt-5 rounded-btn bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-accent-fg"
            onClick={() => navigate('/login', { replace: true })}
          >
            Return to sign in
          </button>
        )}
      </div>
    </div>
  );
}
