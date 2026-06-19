// =============================================================================
// Medgnosis Web - Password reset page
// =============================================================================

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { api, apiErrorMessage } from '../services/api.js';

type ResetResponse = {
  message?: string;
};

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token')?.trim() ?? '';
  const hasToken = Boolean(token);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirectToLogin, setRedirectToLogin] = useState(false);

  useEffect(() => {
    if (!redirectToLogin) return undefined;

    const timeout = window.setTimeout(() => {
      navigate('/login', { replace: true });
    }, 1100);

    return () => window.clearTimeout(timeout);
  }, [navigate, redirectToLogin]);

  const handleRequest = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim()) {
      setError('Email address is required.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<ResetResponse>('/auth/request-password-reset', {
        email: email.trim(),
      });
      setSuccess(res.data?.message ?? 'If this email is eligible for password reset, instructions have been sent.');
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not request password reset.'));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');

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
      const res = await api.post<ResetResponse>('/auth/reset-password', {
        token,
        password,
      });
      setSuccess(res.data?.message ?? 'Password reset successfully. Redirecting to sign in...');
      setRedirectToLogin(true);
    } catch (err) {
      setError(apiErrorMessage(err, 'Password reset failed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rpg">
      <style>{`
        .rpg {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: #050D1A;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 16px;
          padding: 32px 24px;
        }
        .rpg-card {
          width: 100%;
          max-width: 420px;
          animation: rpg-rise 0.7s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes rpg-rise {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .rpg-brand {
          font-family: 'EB Garamond', serif;
          font-size: 40px;
          font-weight: 600;
          color: #EEF2F6;
          letter-spacing: 0;
          margin-bottom: 30px;
          text-align: center;
        }
        .rpg-heading { margin-bottom: 28px; }
        .rpg-heading h1 {
          font-family: 'EB Garamond', serif;
          font-size: 28px;
          font-weight: 700;
          color: #EEF2F6;
          letter-spacing: 0;
          line-height: 1.16;
          margin: 0 0 8px;
        }
        .rpg-heading p {
          color: #4E5D6C;
          font-size: 14px;
          line-height: 1.55;
          margin: 0;
        }
        .rpg-f { margin-bottom: 18px; }
        .rpg-label {
          display: block;
          color: #5E6F7E;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0;
          margin-bottom: 7px;
          text-transform: uppercase;
        }
        .rpg-wrap { position: relative; }
        .rpg-input {
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
        .rpg-input::placeholder { color: rgba(78,93,108,0.65); }
        .rpg-input:hover:not(:disabled) { border-color: rgba(13,217,217,0.22); }
        .rpg-input:focus {
          border-color: rgba(13,217,217,0.5);
          box-shadow: 0 0 0 3px rgba(13,217,217,0.09);
          background: rgba(13,217,217,0.036);
        }
        .rpg-input:disabled { opacity: 0.48; cursor: not-allowed; }
        .rpg-pw-btn {
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
        .rpg-pw-btn:hover:not(:disabled) { color: #8FA0AE; }
        .rpg-error,
        .rpg-success {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          padding: 11px 13px;
          border-radius: 8px;
          margin-bottom: 16px;
        }
        .rpg-error {
          background: rgba(232,90,107,0.08);
          border: 1px solid rgba(232,90,107,0.2);
        }
        .rpg-success {
          background: rgba(13,217,217,0.05);
          border: 1px solid rgba(13,217,217,0.15);
        }
        .rpg-error-icon { color: #E85A6B; flex-shrink: 0; margin-top: 1px; }
        .rpg-success-icon { color: #0DD9D9; flex-shrink: 0; margin-top: 1px; }
        .rpg-error-text,
        .rpg-success-text {
          font-size: 13px;
          line-height: 1.45;
        }
        .rpg-error-text { color: #E85A6B; }
        .rpg-success-text { color: #B8C7D3; }
        .rpg-submit {
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
        }
        .rpg-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 22px rgba(13,217,217,0.28), 0 0 48px rgba(13,217,217,0.1);
        }
        .rpg-submit:disabled { opacity: 0.58; cursor: not-allowed; }
        .rpg-spin {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(5,13,26,0.28);
          border-top-color: #050D1A;
          border-radius: 50%;
          animation: rpg-spin 0.6s linear infinite;
        }
        @keyframes rpg-spin { to { transform: rotate(360deg); } }
        .rpg-link {
          display: block;
          text-align: center;
          margin-top: 22px;
          color: #4E5D6C;
          font-size: 14px;
        }
        .rpg-link a {
          color: #0DD9D9;
          font-weight: 600;
          text-decoration: none;
        }
        .rpg-footer {
          margin-top: 28px;
          display: flex;
          justify-content: center;
        }
        .rpg-hipaa {
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
        .rpg-hipaa-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #0DD9D9;
          box-shadow: 0 0 5px rgba(13,217,217,0.6);
        }
      `}</style>

      <div className="rpg-card">
        <div className="rpg-brand">Medgnosis</div>

        <div className="rpg-heading">
          <h1>{hasToken ? 'Reset your password' : 'Recover your account'}</h1>
          <p>
            {hasToken
              ? 'Set a new password for your Medgnosis account.'
              : 'Enter your email address to receive reset instructions.'}
          </p>
        </div>

        {error && (
          <div className="rpg-error" role="alert">
            <span className="rpg-error-icon">
              <AlertCircle size={14} strokeWidth={2} />
            </span>
            <span className="rpg-error-text">{error}</span>
          </div>
        )}

        {success && (
          <div className="rpg-success" role="status" aria-live="polite">
            <span className="rpg-success-icon">
              <CheckCircle2 size={16} strokeWidth={2} />
            </span>
            <span className="rpg-success-text">{success}</span>
          </div>
        )}

        {hasToken ? (
          <form onSubmit={handleReset} noValidate autoComplete="on" aria-busy={loading}>
            <div className="rpg-f">
              <label className="rpg-label" htmlFor="rpg-password">New password</label>
              <div className="rpg-wrap">
                <input
                  id="rpg-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="rpg-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  placeholder="At least 8 characters"
                  disabled={loading || Boolean(success)}
                />
                <button
                  type="button"
                  className="rpg-pw-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={loading || Boolean(success)}
                >
                  {showPassword ? <EyeOff size={17} strokeWidth={1.8} /> : <Eye size={17} strokeWidth={1.8} />}
                </button>
              </div>
            </div>

            <div className="rpg-f">
              <label className="rpg-label" htmlFor="rpg-confirm-password">Confirm password</label>
              <div className="rpg-wrap">
                <input
                  id="rpg-confirm-password"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="rpg-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  placeholder="Repeat password"
                  disabled={loading || Boolean(success)}
                />
                <button
                  type="button"
                  className="rpg-pw-btn"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                  disabled={loading || Boolean(success)}
                >
                  {showConfirmPassword ? <EyeOff size={17} strokeWidth={1.8} /> : <Eye size={17} strokeWidth={1.8} />}
                </button>
              </div>
            </div>

            <button type="submit" className="rpg-submit" disabled={loading || Boolean(success)}>
              {loading && <span className="rpg-spin" aria-hidden="true" />}
              {loading ? 'Resetting...' : 'Reset password'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRequest} noValidate autoComplete="on" aria-busy={loading}>
            <div className="rpg-f">
              <label className="rpg-label" htmlFor="rpg-email">Email address</label>
              <input
                id="rpg-email"
                name="email"
                type="email"
                className="rpg-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                placeholder="clinician@hospital.org"
                disabled={loading || Boolean(success)}
              />
            </div>

            <button type="submit" className="rpg-submit" disabled={loading || Boolean(success)}>
              {loading && <span className="rpg-spin" aria-hidden="true" />}
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}

        <div className="rpg-link">
          Remember your password? <Link to="/login">Sign in</Link>
        </div>

        <div className="rpg-footer">
          <div className="rpg-hipaa">
            <span className="rpg-hipaa-dot" />
            <ShieldCheck size={12} strokeWidth={1.8} />
            HIPAA &middot; SOC 2 Type II
          </div>
        </div>
      </div>
    </div>
  );
}
