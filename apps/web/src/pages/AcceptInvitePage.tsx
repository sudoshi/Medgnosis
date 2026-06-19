// =============================================================================
// Medgnosis Web - Invite activation page
// =============================================================================

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { api, apiErrorMessage } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import type { AuthTokens, User } from '@medgnosis/shared';

type InviteActivationResponse = {
  message?: string;
  user?: User;
  tokens?: AuthTokens;
};

type InviteLookupResponse = {
  invite?: {
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    expires_at: string;
  };
};

export function AcceptInvitePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setAuth } = useAuthStore();
  const token = params.get('token')?.trim() ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState(token ? '' : 'This invite link is missing an activation token.');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingInvite, setCheckingInvite] = useState(Boolean(token));
  const [inviteValidated, setInviteValidated] = useState(false);
  const [invite, setInvite] = useState<InviteLookupResponse['invite'] | null>(null);
  const [redirectToLogin, setRedirectToLogin] = useState(false);

  useEffect(() => {
    if (!token) return undefined;

    let cancelled = false;
    setCheckingInvite(true);
    setInviteValidated(false);
    setInvite(null);
    setError('');

    api.post<InviteLookupResponse>('/auth/accept-invite', { token })
      .then((res) => {
        if (cancelled) return;
        if (!res.success || !res.data?.invite) {
          setError(res.error?.message ?? 'Invitation is invalid or expired.');
          return;
        }
        setInvite(res.data.invite);
        setInviteValidated(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(apiErrorMessage(err, 'Invitation is invalid or expired.'));
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingInvite(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!redirectToLogin) return undefined;

    const timeout = window.setTimeout(() => {
      navigate('/login', { replace: true });
    }, 1100);

    return () => window.clearTimeout(timeout);
  }, [navigate, redirectToLogin]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!token) {
      setError('This invite link is missing an activation token.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<InviteActivationResponse>('/auth/set-password', {
        token,
        password,
      });

      if (!res.success) {
        setError(res.error?.message ?? 'Invite activation failed.');
        return;
      }

      if (res.data?.user && res.data.tokens) {
        setAuth(res.data.user, res.data.tokens);
        navigate('/dashboard', { replace: true });
        return;
      }

      setSuccess(res.data?.message ?? 'Your account is active. Redirecting to sign in...');
      setRedirectToLogin(true);
    } catch (err) {
      setError(apiErrorMessage(err, 'Invite activation failed.'));
    } finally {
      setLoading(false);
    }
  };

  const disableForm = loading || checkingInvite || !token || !inviteValidated || Boolean(success);

  return (
    <div className="aipg">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700;800&display=swap');

        .aipg {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: #050D1A;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 16px;
          padding: 32px 24px;
        }

        .aipg-card {
          width: 100%;
          max-width: 420px;
          animation: aipg-rise 0.85s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes aipg-rise {
          from { opacity: 0; transform: translateY(22px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .aipg-brand {
          font-family: 'EB Garamond', serif;
          font-size: 40px;
          font-weight: 600;
          color: #EEF2F6;
          letter-spacing: 0;
          margin-bottom: 30px;
          text-align: center;
        }

        .aipg-heading { margin-bottom: 28px; }
        .aipg-heading h1 {
          font-family: 'EB Garamond', serif;
          font-size: 28px;
          font-weight: 700;
          color: #EEF2F6;
          letter-spacing: 0;
          line-height: 1.16;
          margin: 0 0 8px;
        }
        .aipg-heading p {
          color: #4E5D6C;
          font-size: 14px;
          line-height: 1.55;
          margin: 0;
        }

        .aipg-f {
          margin-bottom: 18px;
          animation: aipg-field-in 0.7s cubic-bezier(0.16,1,0.3,1) both;
        }
        .aipg-f:nth-of-type(1) { animation-delay: 0.12s; }
        .aipg-f:nth-of-type(2) { animation-delay: 0.18s; }
        @keyframes aipg-field-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .aipg-label {
          display: block;
          color: #5E6F7E;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0;
          margin-bottom: 7px;
          text-transform: uppercase;
        }
        .aipg-wrap { position: relative; }
        .aipg-input {
          display: block;
          width: 100%;
          padding: 12px 44px 12px 14px;
          background: rgba(255,255,255,0.032);
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 8px;
          color: #E4EBF2;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          line-height: 1.4;
          outline: none;
          transition: border-color 0.22s, box-shadow 0.22s, background 0.22s;
          box-sizing: border-box;
          -webkit-appearance: none;
        }
        .aipg-input::placeholder { color: rgba(78,93,108,0.65); }
        .aipg-input:hover:not(:disabled) { border-color: rgba(13,217,217,0.22); }
        .aipg-input:focus {
          border-color: rgba(13,217,217,0.5);
          box-shadow: 0 0 0 3px rgba(13,217,217,0.09);
          background: rgba(13,217,217,0.036);
        }
        .aipg-input:disabled { opacity: 0.48; cursor: not-allowed; }

        .aipg-pw-btn {
          position: absolute;
          right: 11px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: rgba(78,93,108,0.75);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          border-radius: 5px;
          transition: color 0.18s;
        }
        .aipg-pw-btn:hover:not(:disabled) { color: #8FA0AE; }
        .aipg-pw-btn:disabled { cursor: not-allowed; opacity: 0.48; }

        .aipg-error,
        .aipg-success {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          padding: 11px 13px;
          border-radius: 8px;
          margin-bottom: 16px;
        }
        .aipg-error {
          background: rgba(232,90,107,0.08);
          border: 1px solid rgba(232,90,107,0.2);
          animation: aipg-err-shake 0.38s ease-out;
        }
        @keyframes aipg-err-shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-5px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(2px); }
        }
        .aipg-success {
          background: rgba(13,217,217,0.05);
          border: 1px solid rgba(13,217,217,0.15);
        }
        .aipg-error-icon { color: #E85A6B; flex-shrink: 0; margin-top: 1px; }
        .aipg-success-icon { color: #0DD9D9; flex-shrink: 0; margin-top: 1px; }
        .aipg-error-text,
        .aipg-success-text {
          font-size: 13px;
          line-height: 1.45;
        }
        .aipg-error-text { color: #E85A6B; }
        .aipg-success-text { color: #B8C7D3; }

        .aipg-submit {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 13px 0;
          background: linear-gradient(135deg, #0DD9D9 0%, #0BA0A0 100%);
          color: #050D1A;
          border: none;
          border-radius: 8px;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0;
          cursor: pointer;
          transition: transform 0.22s, box-shadow 0.22s;
          position: relative;
          overflow: hidden;
          animation: aipg-field-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.24s both;
        }
        .aipg-submit::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
          left: -100%;
        }
        .aipg-submit:hover:not(:disabled)::before {
          animation: aipg-btn-shim 0.65s ease-out;
        }
        @keyframes aipg-btn-shim {
          from { left: -100%; }
          to { left: 100%; }
        }
        .aipg-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 22px rgba(13,217,217,0.28), 0 0 48px rgba(13,217,217,0.1);
        }
        .aipg-submit:active:not(:disabled) { transform: translateY(0); box-shadow: none; }
        .aipg-submit:disabled { opacity: 0.58; cursor: not-allowed; }
        .aipg-spin {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(5,13,26,0.28);
          border-top-color: #050D1A;
          border-radius: 50%;
          animation: aipg-do-spin 0.6s linear infinite;
        }
        .aipg-spin--teal {
          border-color: rgba(13,217,217,0.2);
          border-top-color: #0DD9D9;
        }
        @keyframes aipg-do-spin { to { transform: rotate(360deg); } }

        .aipg-link {
          display: block;
          text-align: center;
          margin-top: 22px;
          color: #4E5D6C;
          font-size: 14px;
          animation: aipg-field-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.3s both;
        }
        .aipg-link a {
          color: #0DD9D9;
          font-weight: 600;
          text-decoration: none;
          transition: color 0.18s;
        }
        .aipg-link a:hover { color: #3AE8E8; }

        .aipg-footer {
          margin-top: 28px;
          display: flex;
          justify-content: center;
          animation: aipg-field-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.36s both;
        }
        .aipg-hipaa {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 5px 13px;
          background: rgba(255,255,255,0.028);
          border: 1px solid rgba(255,255,255,0.065);
          border-radius: 20px;
          color: #3D4D5A;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0;
          text-transform: uppercase;
        }
        .aipg-hipaa-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #0DD9D9;
          box-shadow: 0 0 5px rgba(13,217,217,0.6);
        }
      `}</style>

      <div className="aipg-card">
        <div className="aipg-brand">Medgnosis</div>

        <div className="aipg-heading">
          <h1>Activate your invite</h1>
          <p>
            {invite
              ? `Set a password for ${invite.email}.`
              : 'Set your password to finish creating your clinical workspace account.'}
          </p>
        </div>

        {checkingInvite && (
          <div className="aipg-success" role="status" aria-live="polite">
            <span className="aipg-spin aipg-spin--teal" aria-hidden="true" />
            <span className="aipg-success-text">Validating invite...</span>
          </div>
        )}

        {error && (
          <div className="aipg-error" role="alert">
            <span className="aipg-error-icon">
              <AlertCircle size={14} strokeWidth={2} />
            </span>
            <span className="aipg-error-text">{error}</span>
          </div>
        )}

        {success && (
          <div className="aipg-success" role="status" aria-live="polite">
            <span className="aipg-success-icon">
              <CheckCircle2 size={16} strokeWidth={2} />
            </span>
            <span className="aipg-success-text">{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate autoComplete="on" aria-busy={loading}>
          <div className="aipg-f">
            <label className="aipg-label" htmlFor="aipg-password">Password</label>
            <div className="aipg-wrap">
              <input
                id="aipg-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                className="aipg-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                placeholder="At least 8 characters"
                disabled={disableForm}
              />
              <button
                type="button"
                className="aipg-pw-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={disableForm}
              >
                {showPassword ? <EyeOff size={17} strokeWidth={1.8} /> : <Eye size={17} strokeWidth={1.8} />}
              </button>
            </div>
          </div>

          <div className="aipg-f">
            <label className="aipg-label" htmlFor="aipg-confirm-password">Confirm password</label>
            <div className="aipg-wrap">
              <input
                id="aipg-confirm-password"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                className="aipg-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                placeholder="Repeat password"
                disabled={disableForm}
              />
              <button
                type="button"
                className="aipg-pw-btn"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                disabled={disableForm}
              >
                {showConfirmPassword ? <EyeOff size={17} strokeWidth={1.8} /> : <Eye size={17} strokeWidth={1.8} />}
              </button>
            </div>
          </div>

          <button type="submit" className="aipg-submit" disabled={disableForm}>
            {loading && <span className="aipg-spin" aria-hidden="true" />}
            {loading ? 'Activating...' : 'Activate account'}
          </button>
        </form>

        <div className="aipg-link">
          Already activated? <Link to="/login">Sign in</Link>
        </div>

        <div className="aipg-footer">
          <div className="aipg-hipaa">
            <span className="aipg-hipaa-dot" />
            <ShieldCheck size={12} strokeWidth={1.8} />
            HIPAA &middot; SOC 2 Type II
          </div>
        </div>
      </div>
    </div>
  );
}
