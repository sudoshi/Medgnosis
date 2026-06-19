import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { api, apiErrorMessage } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import type { AuthTokens, OidcExchangeResponse, User } from '@medgnosis/shared';

export function OidcCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setAuth } = useAuthStore();
  const exchanged = useRef(false);
  const [error, setError] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaUserEmail, setMfaUserEmail] = useState('');
  const [verifying, setVerifying] = useState(false);
  const code = params.get('code');

  useEffect(() => {
    if (!code || exchanged.current) return;
    exchanged.current = true;

    api.post<OidcExchangeResponse>('/auth/oidc/exchange', { code })
      .then((res) => {
        if (!res.data) {
          throw new Error(res.error?.message ?? 'Single sign-on failed');
        }
        if (res.data.mfa_required && res.data.mfa_token) {
          setMfaToken(res.data.mfa_token);
          setMfaUserEmail(res.data.user.email);
          return;
        }
        if (!res.data.tokens) {
          throw new Error('Single sign-on did not return a session');
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

  const verifyMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setVerifying(true);
    try {
      const res = await api.post<{ user: User; tokens: AuthTokens }>('/auth/mfa/verify', {
        mfa_token: mfaToken,
        code: mfaCode,
      });
      if (!res.data) {
        throw new Error(res.error?.message ?? 'MFA verification failed');
      }
      setAuth(res.data.user, res.data.tokens);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, 'MFA verification failed'));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-void px-4">
      <div className="surface max-w-sm p-6 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-card bg-[var(--primary-bg)] text-[var(--primary)]">
          <ShieldCheck size={22} strokeWidth={1.7} />
        </div>
        <h1 className="text-lg font-semibold text-bright">
          {mfaToken ? 'Verify your code' : 'Completing sign-in'}
        </h1>
        <p className="mt-2 text-sm text-ghost">
          {error || (mfaToken
            ? `Complete sign-in for ${mfaUserEmail || 'your account'}`
            : 'Verifying your Medgnosis session...')}
        </p>
        {mfaToken && (
          <form className="mt-5 space-y-3 text-left" onSubmit={verifyMfa}>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ghost" htmlFor="oidc-mfa-code">
              Authenticator code
            </label>
            <input
              id="oidc-mfa-code"
              name="one-time-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="w-full rounded-btn border border-edge bg-s1 px-3 py-2 text-sm text-bright outline-none focus:border-teal"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
              placeholder="123456"
              disabled={verifying}
            />
            <button
              type="submit"
              className="w-full rounded-btn bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-accent-fg disabled:cursor-not-allowed disabled:opacity-60"
              disabled={verifying || !mfaCode.trim()}
            >
              {verifying ? 'Verifying...' : 'Verify code'}
            </button>
          </form>
        )}
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
