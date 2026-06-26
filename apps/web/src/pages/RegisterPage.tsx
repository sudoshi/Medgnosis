// =============================================================================
// Medgnosis Web — Register Page (Clinical Obsidian v2 theme)
// =============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { api, apiErrorMessage } from '../services/api.js';
import type { AuthProviderDiscovery } from '@medgnosis/shared';

export function RegisterPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get<AuthProviderDiscovery>('/auth/providers')
      .then((res) => {
        if (!cancelled) setRegistrationEnabled(Boolean(res.data?.registration_enabled));
      })
      .catch(() => {
        if (!cancelled) setRegistrationEnabled(false);
      })
      .finally(() => {
        if (!cancelled) setPolicyLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (!registrationEnabled) {
      setError('Registration is invite-only. Contact an administrator for access.');
      return;
    }
    setLoading(true);

    try {
      const res = await api.post<{ message: string }>('/auth/register', {
        email,
        firstName,
        lastName,
        ...(phone ? { phone } : {}),
      });

      if (res.success) {
        setSuccess(true);
      } else {
        setError(res.error?.message ?? 'Registration failed');
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'An unexpected error occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rpg">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700;800&display=swap');

        .rpg {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: #050D1A;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: clamp(14px, 1.1vw, 22px);
          padding: 32px 24px;
        }

        .rpg-card {
          width: 100%;
          max-width: 400px;
          animation: rpg-rise 0.85s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes rpg-rise {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .rpg-brand {
          font-family: 'EB Garamond', serif;
          font-size: 2.5em;
          font-weight: 600;
          color: #EEF2F6;
          letter-spacing: -0.5px;
          margin-bottom: 1.2em;
          text-align: center;
        }

        .rpg-heading {
          margin-bottom: 28px;
        }
        .rpg-heading h2 {
          font-family: 'EB Garamond', sans-serif;
          font-size: 1.625em;
          font-weight: 700;
          color: #EEF2F6;
          margin: 0 0 7px;
          letter-spacing: -0.5px;
          line-height: 1.15;
        }
        .rpg-heading p {
          font-size: 0.844em;
          color: #4E5D6C;
          margin: 0;
          line-height: 1.5;
        }

        .rpg-f {
          margin-bottom: 18px;
          animation: rpg-field-in 0.7s cubic-bezier(0.16,1,0.3,1) both;
        }
        .rpg-f:nth-of-type(1) { animation-delay: 0.12s; }
        .rpg-f:nth-of-type(2) { animation-delay: 0.18s; }
        .rpg-f:nth-of-type(3) { animation-delay: 0.24s; }
        .rpg-f:nth-of-type(4) { animation-delay: 0.30s; }
        @keyframes rpg-field-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .rpg-label {
          display: block;
          font-size: 0.688em;
          font-weight: 600;
          color: #5E6F7E;
          letter-spacing: 0.75px;
          text-transform: uppercase;
          margin-bottom: 7px;
        }
        .rpg-input {
          display: block;
          width: 100%;
          padding: 12px 14px;
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
        .rpg-input::placeholder { color: rgba(78,93,108,0.65); }
        .rpg-input:hover:not(:disabled) { border-color: rgba(13,217,217,0.22); }
        .rpg-input:focus {
          border-color: rgba(13,217,217,0.5);
          box-shadow: 0 0 0 3px rgba(13,217,217,0.09);
          background: rgba(13,217,217,0.036);
        }
        .rpg-input:disabled { opacity: 0.48; cursor: not-allowed; }

        .rpg-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .rpg-error {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          padding: 11px 13px;
          background: rgba(232,90,107,0.08);
          border: 1px solid rgba(232,90,107,0.2);
          border-radius: 8px;
          margin-bottom: 16px;
          animation: rpg-err-shake 0.38s ease-out;
        }
        @keyframes rpg-err-shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-5px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(2px); }
        }
        .rpg-error-icon { color: #E85A6B; flex-shrink: 0; margin-top: 1px; }
        .rpg-error-text { font-size: 0.813em; color: #E85A6B; line-height: 1.45; }

        .rpg-success {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 28px 20px;
          background: rgba(13,217,217,0.05);
          border: 1px solid rgba(13,217,217,0.15);
          border-radius: 12px;
          text-align: center;
          animation: rpg-rise 0.85s cubic-bezier(0.16,1,0.3,1) both;
        }
        .rpg-success-icon { color: #0DD9D9; }
        .rpg-success-title {
          font-family: 'EB Garamond', sans-serif;
          font-size: 1.25em;
          font-weight: 700;
          color: #EEF2F6;
          margin: 0;
        }
        .rpg-success-text {
          font-size: 0.875em;
          color: #4E5D6C;
          line-height: 1.55;
          margin: 0;
        }
        .rpg-policy {
          padding: 24px 20px;
          background: rgba(255,255,255,0.028);
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 12px;
          text-align: center;
          animation: rpg-rise 0.85s cubic-bezier(0.16,1,0.3,1) both;
        }

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
          font-size: 0.906em;
          font-weight: 700;
          letter-spacing: 0.1px;
          cursor: pointer;
          transition: transform 0.22s, box-shadow 0.22s;
          position: relative;
          overflow: hidden;
          animation: rpg-field-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.36s both;
        }
        .rpg-submit::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
          left: -100%;
        }
        .rpg-submit:hover:not(:disabled)::before {
          animation: rpg-btn-shim 0.65s ease-out;
        }
        @keyframes rpg-btn-shim {
          from { left: -100%; } to { left: 100%; }
        }
        .rpg-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 22px rgba(13,217,217,0.28), 0 0 48px rgba(13,217,217,0.1);
        }
        .rpg-submit:active:not(:disabled) { transform: translateY(0); box-shadow: none; }
        .rpg-submit:disabled { opacity: 0.58; cursor: not-allowed; }
        .rpg-spin {
          width: 16px; height: 16px;
          border: 2px solid rgba(5,13,26,0.28);
          border-top-color: #050D1A;
          border-radius: 50%;
          animation: rpg-do-spin 0.6s linear infinite;
        }
        @keyframes rpg-do-spin { to { transform: rotate(360deg); } }

        .rpg-link {
          display: block;
          text-align: center;
          margin-top: 22px;
          font-size: 0.844em;
          color: #4E5D6C;
          animation: rpg-field-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.42s both;
        }
        .rpg-link a {
          color: #0DD9D9;
          text-decoration: none;
          font-weight: 600;
          transition: color 0.18s;
        }
        .rpg-link a:hover { color: #3AE8E8; }

        .rpg-footer {
          margin-top: 28px;
          display: flex;
          justify-content: center;
          animation: rpg-field-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.48s both;
        }
        .rpg-hipaa {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 5px 13px;
          background: rgba(255,255,255,0.028);
          border: 1px solid rgba(255,255,255,0.065);
          border-radius: 20px;
          font-size: 0.656em;
          font-weight: 600;
          color: #3D4D5A;
          letter-spacing: 0.55px;
          text-transform: uppercase;
        }
        .rpg-hipaa-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #0DD9D9;
          box-shadow: 0 0 5px rgba(13,217,217,0.6);
        }
      `}</style>

      <div className="rpg-card">
        <div className="rpg-brand">Medgnosis</div>

        {!policyLoaded ? (
          <div className="rpg-policy" role="status">
            <h3 className="rpg-success-title">Checking account access</h3>
          </div>
        ) : !registrationEnabled ? (
          <div className="rpg-policy">
            <h3 className="rpg-success-title">Account access is invite-only</h3>
            <p className="rpg-success-text">
              Contact an administrator for access to this Medgnosis workspace.
            </p>
            <div className="rpg-link" style={{ marginTop: 8 }}>
              <Link to="/login">Back to Sign in</Link>
            </div>
          </div>
        ) : success ? (
          <div className="rpg-success">
            <CheckCircle2 size={40} strokeWidth={1.5} className="rpg-success-icon" />
            <h3 className="rpg-success-title">Check your inbox</h3>
            <p className="rpg-success-text">
              If this email is not already registered, a temporary password has been sent to your inbox.
              Use it to sign in, and you will be prompted to create a new password.
            </p>
            <div className="rpg-link" style={{ marginTop: 8 }}>
              <Link to="/login">Back to Sign in</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="rpg-heading">
              <h2>Create your account</h2>
              <p>Get access to your clinical workspace</p>
            </div>

            <form onSubmit={handleSubmit} noValidate autoComplete="on">
              <div className="rpg-row">
                <div className="rpg-f">
                  <label className="rpg-label" htmlFor="rpg-fn">First name</label>
                  <input
                    id="rpg-fn"
                    name="firstName"
                    type="text"
                    className="rpg-input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    required
                    placeholder="Jane"
                    disabled={loading}
                  />
                </div>

                <div className="rpg-f">
                  <label className="rpg-label" htmlFor="rpg-ln">Last name</label>
                  <input
                    id="rpg-ln"
                    name="lastName"
                    type="text"
                    className="rpg-input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                    required
                    placeholder="Smith"
                    disabled={loading}
                  />
                </div>
              </div>

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
                  disabled={loading}
                />
              </div>

              <div className="rpg-f">
                <label className="rpg-label" htmlFor="rpg-phone">Phone (optional)</label>
                <input
                  id="rpg-phone"
                  name="phone"
                  type="tel"
                  className="rpg-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  placeholder="(555) 123-4567"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="rpg-error" role="alert">
                  <span className="rpg-error-icon">
                    <AlertCircle size={14} strokeWidth={2} />
                  </span>
                  <span className="rpg-error-text">{error}</span>
                </div>
              )}

              <button type="submit" className="rpg-submit" disabled={loading}>
                {loading && <span className="rpg-spin" aria-hidden="true" />}
                {loading ? 'Creating account...' : 'Create account'}
              </button>
            </form>

            <div className="rpg-link">
              Already have an account? <Link to="/login">Sign in</Link>
            </div>
          </>
        )}

        <div className="rpg-footer">
          <div className="rpg-hipaa">
            <span className="rpg-hipaa-dot" />
            HIPAA &middot; SOC 2 Type II
          </div>
        </div>
      </div>
    </div>
  );
}
