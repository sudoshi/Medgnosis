// =============================================================================
// Medgnosis Web — Change Password Modal (non-dismissable)
// Shown when must_change_password is true after login with temp password
// =============================================================================

import { useState, useMemo } from 'react';
import { AlertCircle, Eye, EyeOff, CheckCircle2, XCircle, Lock } from 'lucide-react';
import { useAuthStore } from '../stores/auth.js';
import { api, apiErrorMessage } from '../services/api.js';

// ── Password strength calculation ─────────────────────────────────────────────

interface StrengthResult {
  score: number;    // 0–4
  label: string;
  color: string;
}

function evaluateStrength(pw: string): StrengthResult {
  if (!pw) return { score: 0, label: '', color: 'transparent' };

  let score = 0;
  if (pw.length >= 8)  score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;

  // Clamp to 4
  score = Math.min(score, 4);

  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  const colors = ['#E85A6B', '#F6A324', '#F6A324', '#0DD9D9', '#22C55E'];

  return {
    score,
    label: labels[score] ?? '',
    color: colors[score] ?? 'transparent',
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChangePasswordModal() {
  const { user, setUser } = useAuthStore();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => evaluateStrength(newPassword), [newPassword]);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    passwordsMatch &&
    !loading;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post<{ message: string }>('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      if (res.success) {
        // Update user in store to remove must_change_password flag
        if (user) {
          setUser({ ...user, must_change_password: false });
        }
      } else {
        setError(res.error?.message ?? 'Password change failed');
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'An unexpected error occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cpw-overlay">
      <style>{`
        .cpw-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(5, 13, 26, 0.92);
          backdrop-filter: blur(8px);
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: clamp(14px, 1.1vw, 22px);
          padding: 24px;
        }

        .cpw-card {
          width: 100%;
          max-width: 400px;
          background: #0C1929;
          border: 1px solid rgba(13, 217, 217, 0.12);
          border-radius: 16px;
          padding: 36px 32px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
          animation: cpw-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes cpw-rise {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .cpw-icon-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px; height: 48px;
          border-radius: 12px;
          background: rgba(13, 217, 217, 0.08);
          border: 1px solid rgba(13, 217, 217, 0.15);
          margin: 0 auto 20px;
          color: #0DD9D9;
        }

        .cpw-title {
          font-family: 'EB Garamond', serif;
          font-size: 1.5em;
          font-weight: 700;
          color: #EEF2F6;
          text-align: center;
          margin: 0 0 6px;
        }
        .cpw-subtitle {
          font-size: 0.844em;
          color: #4E5D6C;
          text-align: center;
          margin: 0 0 28px;
          line-height: 1.5;
        }

        .cpw-f {
          margin-bottom: 16px;
        }
        .cpw-label {
          display: block;
          font-size: 0.688em;
          font-weight: 600;
          color: #5E6F7E;
          letter-spacing: 0.75px;
          text-transform: uppercase;
          margin-bottom: 7px;
        }
        .cpw-wrap { position: relative; }
        .cpw-input {
          display: block;
          width: 100%;
          padding: 12px 44px 12px 14px;
          background: rgba(255,255,255,0.032);
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 8px;
          color: #E4EBF2;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.875em;
          line-height: 1.4;
          outline: none;
          transition: border-color 0.22s, box-shadow 0.22s, background 0.22s;
          box-sizing: border-box;
          -webkit-appearance: none;
        }
        .cpw-input::placeholder { color: rgba(78,93,108,0.65); }
        .cpw-input:hover:not(:disabled) { border-color: rgba(13,217,217,0.22); }
        .cpw-input:focus {
          border-color: rgba(13,217,217,0.5);
          box-shadow: 0 0 0 3px rgba(13,217,217,0.09);
          background: rgba(13,217,217,0.036);
        }
        .cpw-input:disabled { opacity: 0.48; cursor: not-allowed; }

        .cpw-pw-btn {
          position: absolute;
          right: 11px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none;
          color: rgba(78,93,108,0.75);
          cursor: pointer; padding: 4px;
          display: flex; align-items: center;
          border-radius: 5px;
          transition: color 0.18s;
        }
        .cpw-pw-btn:hover { color: #8FA0AE; }

        /* Strength meter */
        .cpw-strength {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
        }
        .cpw-strength-bars {
          display: flex;
          gap: 3px;
          flex: 1;
        }
        .cpw-strength-bar {
          height: 3px;
          flex: 1;
          border-radius: 2px;
          background: rgba(255,255,255,0.06);
          transition: background 0.25s;
        }
        .cpw-strength-label {
          font-size: 0.688em;
          color: #4E5D6C;
          white-space: nowrap;
          min-width: 72px;
          text-align: right;
        }

        /* Validation hints */
        .cpw-hint {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75em;
          margin-top: 6px;
          transition: color 0.2s;
        }
        .cpw-hint--pass { color: #0DD9D9; }
        .cpw-hint--fail { color: #4E5D6C; }
        .cpw-hint--error { color: #E85A6B; }

        .cpw-error {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          padding: 11px 13px;
          background: rgba(232,90,107,0.08);
          border: 1px solid rgba(232,90,107,0.2);
          border-radius: 8px;
          margin-bottom: 16px;
        }
        .cpw-error-icon { color: #E85A6B; flex-shrink: 0; margin-top: 1px; }
        .cpw-error-text { font-size: 0.813em; color: #E85A6B; line-height: 1.45; }

        .cpw-submit {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 13px 0;
          margin-top: 24px;
          background: linear-gradient(135deg, #0DD9D9 0%, #0BA0A0 100%);
          color: #050D1A;
          border: none;
          border-radius: 8px;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.906em;
          font-weight: 700;
          letter-spacing: 0.1px;
          cursor: pointer;
          transition: transform 0.22s, box-shadow 0.22s, opacity 0.22s;
        }
        .cpw-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 22px rgba(13,217,217,0.28);
        }
        .cpw-submit:active:not(:disabled) { transform: translateY(0); box-shadow: none; }
        .cpw-submit:disabled { opacity: 0.45; cursor: not-allowed; }
        .cpw-spin {
          width: 16px; height: 16px;
          border: 2px solid rgba(5,13,26,0.28);
          border-top-color: #050D1A;
          border-radius: 50%;
          animation: cpw-do-spin 0.6s linear infinite;
        }
        @keyframes cpw-do-spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="cpw-card">
        <div className="cpw-icon-wrap">
          <Lock size={22} strokeWidth={1.8} />
        </div>

        <h2 className="cpw-title">Change your password</h2>
        <p className="cpw-subtitle">
          Your account requires a password change before continuing.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {/* Current password */}
          <div className="cpw-f">
            <label className="cpw-label" htmlFor="cpw-current">Current (temporary) password</label>
            <div className="cpw-wrap">
              <input
                id="cpw-current"
                type={showCurrent ? 'text' : 'password'}
                className="cpw-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter your temporary password"
                disabled={loading}
              />
              <button
                type="button"
                className="cpw-pw-btn"
                onClick={() => setShowCurrent((v) => !v)}
                aria-label={showCurrent ? 'Hide password' : 'Show password'}              >
                {showCurrent ? <EyeOff size={17} strokeWidth={1.8} /> : <Eye size={17} strokeWidth={1.8} />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div className="cpw-f">
            <label className="cpw-label" htmlFor="cpw-new">New password</label>
            <div className="cpw-wrap">
              <input
                id="cpw-new"
                type={showNew ? 'text' : 'password'}
                className="cpw-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                disabled={loading}
              />
              <button
                type="button"
                className="cpw-pw-btn"
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? 'Hide password' : 'Show password'}              >
                {showNew ? <EyeOff size={17} strokeWidth={1.8} /> : <Eye size={17} strokeWidth={1.8} />}
              </button>
            </div>

            {/* Strength meter */}
            {newPassword.length > 0 && (
              <div className="cpw-strength">
                <div className="cpw-strength-bars">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="cpw-strength-bar"
                      style={i < strength.score ? { background: strength.color } : undefined}
                    />
                  ))}
                </div>
                <span className="cpw-strength-label" style={{ color: strength.color }}>
                  {strength.label}
                </span>
              </div>
            )}

            {/* Min length hint */}
            <div className={`cpw-hint ${newPassword.length >= 8 ? 'cpw-hint--pass' : 'cpw-hint--fail'}`}>
              {newPassword.length >= 8
                ? <CheckCircle2 size={13} strokeWidth={2} />
                : <XCircle size={13} strokeWidth={2} />}
              <span>At least 8 characters</span>
            </div>
          </div>

          {/* Confirm password */}
          <div className="cpw-f">
            <label className="cpw-label" htmlFor="cpw-confirm">Confirm new password</label>
            <div className="cpw-wrap">
              <input
                id="cpw-confirm"
                type={showConfirm ? 'text' : 'password'}
                className="cpw-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Re-enter new password"
                disabled={loading}
              />
              <button
                type="button"
                className="cpw-pw-btn"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}              >
                {showConfirm ? <EyeOff size={17} strokeWidth={1.8} /> : <Eye size={17} strokeWidth={1.8} />}
              </button>
            </div>

            {passwordsMatch && (
              <div className="cpw-hint cpw-hint--pass">
                <CheckCircle2 size={13} strokeWidth={2} />
                <span>Passwords match</span>
              </div>
            )}
            {passwordsMismatch && (
              <div className="cpw-hint cpw-hint--error">
                <XCircle size={13} strokeWidth={2} />
                <span>Passwords do not match</span>
              </div>
            )}
          </div>

          {error && (
            <div className="cpw-error" role="alert">
              <span className="cpw-error-icon">
                <AlertCircle size={14} strokeWidth={2} />
              </span>
              <span className="cpw-error-text">{error}</span>
            </div>
          )}

          <button type="submit" className="cpw-submit" disabled={!canSubmit}>
            {loading && <span className="cpw-spin" aria-hidden="true" />}
            {loading ? 'Updating password...' : 'Set new password'}
          </button>
        </form>
      </div>
    </div>
  );
}
