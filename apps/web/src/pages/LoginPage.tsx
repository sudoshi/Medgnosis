// =============================================================================
// Medgnosis Web — Login  (Clinical Obsidian v2 · "Patient Grid" redesign)
// Split-screen: form left (42%), animated population network right (58%)
// Matches MindLog's production quality with a distinct clinical-data aesthetic
// =============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../stores/auth.js';
import { api } from '../services/api.js';
import type { User, AuthTokens } from '@medgnosis/shared';

// ── Population Network Visualization (SVG) ───────────────────────────────────

// [cx, cy, radius, type: 0=normal | 1=high-risk | 2=dim]
const NET_NODES: [number, number, number, 0 | 1 | 2][] = [
  // Row 1 — top
  [108, 72,  3.5, 2], [242, 108, 5.0, 0], [372, 84,  3.5, 0], [478, 138, 4.5, 1], [562, 66,  3.0, 2],
  // Row 2 — upper mid
  [62,  208, 4.0, 2], [184, 250, 5.5, 0], [316, 232, 4.0, 0], [438, 268, 5.0, 1], [574, 224, 4.0, 0], [632, 170, 3.0, 2],
  // Row 3 — center
  [138, 370, 5.0, 0], [276, 344, 7.0, 0], [406, 390, 5.0, 1], [518, 350, 4.5, 0], [636, 334, 3.5, 2],
  // Row 4 — lower mid
  [88,  492, 4.0, 2], [234, 468, 5.5, 0], [366, 512, 4.0, 0], [494, 476, 6.0, 1], [614, 502, 3.5, 2],
  // Row 5 — bottom
  [170, 628, 4.5, 0], [306, 592, 5.0, 0], [424, 648, 4.0, 1], [544, 610, 3.5, 2], [668, 570, 4.0, 0],
];

const NET_EDGES: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[1,6],[2,7],[3,8],[4,9],[4,10],
  [5,6],[6,7],[7,8],[8,9],[9,10],
  [6,11],[7,12],[8,13],[9,14],[10,15],
  [11,12],[12,13],[13,14],[14,15],
  [11,16],[12,17],[13,18],[14,19],[15,20],
  [16,17],[17,18],[18,19],[19,20],
  [17,21],[18,22],[19,23],[20,24],[20,25],
  [21,22],[22,23],[23,24],[24,25],
  // Cross-links for density
  [1,7],[7,13],[13,19],[6,12],[12,18],[18,22],
];

// Nodes that emit expanding ripple rings
const RIPPLE_NODES: { idx: number; delay: number }[] = [
  { idx: 3,  delay: 0.0 },
  { idx: 6,  delay: 1.4 },
  { idx: 8,  delay: 2.8 },
  { idx: 12, delay: 0.7 },
  { idx: 13, delay: 3.5 },
  { idx: 19, delay: 1.8 },
  { idx: 23, delay: 4.2 },
];

function PopulationNetwork() {
  return (
    <svg
      viewBox="0 0 720 720"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <defs>
        <pattern id="pg-grid" width="52" height="52" patternUnits="userSpaceOnUse">
          <path d="M52 0L0 0 0 52" fill="none" stroke="rgba(13,217,217,0.03)" strokeWidth="0.5"/>
        </pattern>
        <radialGradient id="pg-fade" cx="50%" cy="50%" r="55%">
          <stop offset="20%" stopColor="transparent"/>
          <stop offset="100%" stopColor="#07101E" stopOpacity="0.9"/>
        </radialGradient>
        <filter id="glow-t" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="glow-a" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Grid underlay */}
      <rect width="720" height="720" fill="url(#pg-grid)"/>

      {/* Edges */}
      {NET_EDGES.map(([a, b], i) => {
        const na = NET_NODES[a], nb = NET_NODES[b];
        if (!na || !nb) return null;
        const active = na[3] !== 2 && nb[3] !== 2;
        return (
          <line
            key={`e${i}`}
            x1={na[0]} y1={na[1]} x2={nb[0]} y2={nb[1]}
            stroke={active ? 'rgba(13,217,217,0.22)' : 'rgba(13,217,217,0.07)'}
            strokeWidth={active ? '0.8' : '0.5'}
            className="pg-edge"
            style={{ animationDelay: `${(i * 0.12) % 2.8}s` }}
          />
        );
      })}

      {/* Ripple rings */}
      {RIPPLE_NODES.map(({ idx, delay }) => {
        const n = NET_NODES[idx];
        if (!n) return null;
        const isAmber = n[3] === 1;
        return (
          <circle
            key={`rpl${idx}`}
            cx={n[0]} cy={n[1]} r={n[2] + 3}
            fill="none"
            stroke={isAmber ? 'rgba(246,163,36,0.55)' : 'rgba(13,217,217,0.5)'}
            strokeWidth="1"
            className="pg-ripple"
            style={{ animationDelay: `${delay}s` }}
          />
        );
      })}

      {/* Nodes */}
      {NET_NODES.map(([cx, cy, r, type], i) => {
        const fill   = type === 1 ? '#F6A324' : type === 2 ? '#1B4F50' : '#0DD9D9';
        const filter = type === 0 ? 'url(#glow-t)' : type === 1 ? 'url(#glow-a)' : undefined;
        const cls    = type === 2 ? 'pg-node pg-node--dim' : type === 1 ? 'pg-node pg-node--risk' : 'pg-node';
        return (
          <circle
            key={`n${i}`}
            cx={cx} cy={cy} r={r}
            fill={fill}
            filter={filter}
            className={cls}
            style={{ animationDelay: `${(i * 0.22) % 3.8}s` }}
          />
        );
      })}

      {/* Edge vignette */}
      <rect width="720" height="720" fill="url(#pg-fade)" style={{ pointerEvents: 'none' }}/>
    </svg>
  );
}

// ── Login Page ─────────────────────────────────────────────────────────────────

export function LoginPage() {
  const navigate    = useNavigate();
  const { setAuth } = useAuthStore();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [remember, setRemember] = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
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

  const fillDemo = () => {
    setEmail('dr.udoshi@medgnosis.app');
    setPassword('password');
  };

  return (
    <div className="lpg">

      {/* ── Injected keyframes & layout ─────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700;800&display=swap');

        /* Layout */
        .lpg {
          display: grid;
          grid-template-columns: 58% 42%;
          min-height: 100vh;
          background: #050D1A;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: clamp(14px, 1.1vw, 22px);
          overflow: hidden;
        }
        @media (max-width: 960px) {
          .lpg { grid-template-columns: 1fr; }
          .lpg-viz { display: none; }
        }

        /* ── FORM PANEL ── */
        .lpg-form {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px;
          position: relative;
          z-index: 2;
        }
        /* Teal gradient divider on left edge */
        .lpg-form::after {
          content: '';
          position: absolute;
          top: 8%; bottom: 8%; left: 0;
          width: 1px;
          background: linear-gradient(
            to bottom,
            transparent 0%,
            rgba(13,217,217,0.1) 20%,
            rgba(13,217,217,0.4) 50%,
            rgba(13,217,217,0.1) 80%,
            transparent 100%
          );
        }
        @media (max-width: 960px) {
          .lpg-form { min-height: 100vh; padding: 32px 24px; }
          .lpg-form::after { display: none; }
        }

        .lpg-card {
          width: 100%;
          max-width: 368px;
          animation: card-rise 0.85s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes card-rise {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Brand title in hero */
        .lpg-brand {
          font-family: 'EB Garamond', serif;
          font-size: 2.5em;
          font-weight: 600;
          color: #EEF2F6;
          letter-spacing: -0.5px;
          margin-bottom: 2em;
          position: relative;
          z-index: 3;
          text-align: center;
          animation: card-rise 0.85s cubic-bezier(0.16,1,0.3,1) 0.04s both;
        }

        /* Heading */
        .lpg-heading {
          margin-bottom: 28px;
          animation: card-rise 0.85s cubic-bezier(0.16,1,0.3,1) 0.09s both;
        }
        .lpg-heading h2 {
          font-family: 'EB Garamond', sans-serif;
          font-size: 1.625em;
          font-weight: 700;
          color: #EEF2F6;
          margin: 0 0 7px;
          letter-spacing: -0.5px;
          line-height: 1.15;
        }
        .lpg-heading p {
          font-size: 0.844em;
          color: #4E5D6C;
          margin: 0;
          line-height: 1.5;
        }

        /* Field */
        .lpg-f {
          margin-bottom: 18px;
          animation: field-in 0.7s cubic-bezier(0.16,1,0.3,1) both;
        }
        .lpg-f:nth-of-type(1) { animation-delay: 0.17s; }
        .lpg-f:nth-of-type(2) { animation-delay: 0.25s; }
        @keyframes field-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .lpg-label {
          display: block;
          font-size: 0.688em;
          font-weight: 600;
          color: #5E6F7E;
          letter-spacing: 0.75px;
          text-transform: uppercase;
          margin-bottom: 7px;
        }
        .lpg-wrap { position: relative; }
        .lpg-input {
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
        .lpg-input::placeholder { color: rgba(78,93,108,0.65); }
        .lpg-input:hover:not(:disabled) { border-color: rgba(13,217,217,0.22); }
        .lpg-input:focus {
          border-color: rgba(13,217,217,0.5);
          box-shadow: 0 0 0 3px rgba(13,217,217,0.09);
          background: rgba(13,217,217,0.036);
        }
        .lpg-input:disabled { opacity: 0.48; cursor: not-allowed; }
        .lpg-input--pw { padding-right: 44px; }

        /* Password toggle */
        .lpg-pw-btn {
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
        .lpg-pw-btn:hover { color: #8FA0AE; }

        /* Remember row */
        .lpg-remember {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 22px;
          animation: field-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.33s both;
          cursor: pointer;
        }
        .lpg-check {
          appearance: none;
          -webkit-appearance: none;
          width: 16px; height: 16px;
          border: 1.5px solid rgba(255,255,255,0.1);
          border-radius: 4px;
          background: rgba(255,255,255,0.03);
          cursor: pointer;
          position: relative;
          flex-shrink: 0;
          transition: all 0.18s;
        }
        .lpg-check:checked {
          background: #0DD9D9;
          border-color: #0DD9D9;
        }
        .lpg-check:checked::after {
          content: '';
          position: absolute;
          left: 4px; top: 1.5px;
          width: 4px; height: 8px;
          border: solid #050D1A;
          border-width: 0 1.5px 1.5px 0;
          transform: rotate(45deg);
        }
        .lpg-check:focus-visible {
          box-shadow: 0 0 0 3px rgba(13,217,217,0.18);
        }
        .lpg-check-label {
          font-size: 0.781em;
          color: #4E5D6C;
          user-select: none;
        }

        /* Error */
        .lpg-error {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          padding: 11px 13px;
          background: rgba(232,90,107,0.08);
          border: 1px solid rgba(232,90,107,0.2);
          border-radius: 8px;
          margin-bottom: 16px;
          animation: err-shake 0.38s ease-out;
        }
        @keyframes err-shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-5px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(2px); }
        }
        .lpg-error-icon { color: #E85A6B; flex-shrink: 0; margin-top: 1px; }
        .lpg-error-text { font-size: 0.813em; color: #E85A6B; line-height: 1.45; }

        /* Submit */
        .lpg-submit {
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
          animation: field-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.39s both;
        }
        .lpg-submit::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
          left: -100%;
          transition: none;
        }
        .lpg-submit:hover:not(:disabled)::before {
          animation: btn-shim 0.65s ease-out;
        }
        @keyframes btn-shim {
          from { left: -100%; } to { left: 100%; }
        }
        .lpg-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 22px rgba(13,217,217,0.28), 0 0 48px rgba(13,217,217,0.1);
        }
        .lpg-submit:active:not(:disabled) { transform: translateY(0); box-shadow: none; }
        .lpg-submit:disabled { opacity: 0.58; cursor: not-allowed; }
        .lpg-spin {
          width: 16px; height: 16px;
          border: 2px solid rgba(5,13,26,0.28);
          border-top-color: #050D1A;
          border-radius: 50%;
          animation: do-spin 0.6s linear infinite;
        }
        @keyframes do-spin { to { transform: rotate(360deg); } }

        /* Demo */
        .lpg-demo {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 9px;
          animation: field-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.45s both;
        }
        .lpg-demo-lbl {
          font-size: 0.656em;
          color: rgba(78,93,108,0.65);
          letter-spacing: 0.4px;
          text-transform: uppercase;
        }
        .lpg-demo-btn {
          padding: 7px 20px;
          background: rgba(255,255,255,0.028);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 7px;
          color: #4E5D6C;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.781em;
          font-weight: 500;
          cursor: pointer;
          transition: border-color 0.18s, color 0.18s, background 0.18s;
        }
        .lpg-demo-btn:hover {
          border-color: rgba(13,217,217,0.28);
          color: #8FA0AE;
          background: rgba(13,217,217,0.04);
        }

        /* Footer */
        .lpg-footer {
          margin-top: 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          animation: field-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.51s both;
        }
        .lpg-hipaa {
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
        .lpg-hipaa-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #0DD9D9;
          box-shadow: 0 0 5px rgba(13,217,217,0.6);
        }
        .lpg-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.719em;
          color: #2E3D4A;
        }

        /* ── VIZ PANEL ── */
        .lpg-viz {
          position: relative;
          background: #07101E;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px;
          overflow: hidden;
        }
        /* Top-right ambient teal wash */
        .lpg-viz::before {
          content: '';
          position: absolute;
          top: -20%; right: -10%;
          width: 65%; height: 60%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(13,217,217,0.052) 0%, transparent 70%);
          filter: blur(55px);
          animation: wash-pulse 11s ease-in-out infinite;
          pointer-events: none;
        }
        /* Bottom-left amber wash */
        .lpg-viz::after {
          content: '';
          position: absolute;
          bottom: -12%; left: -8%;
          width: 55%; height: 48%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(246,163,36,0.04) 0%, transparent 70%);
          filter: blur(48px);
          animation: wash-pulse 14s ease-in-out infinite reverse;
          pointer-events: none;
        }
        @keyframes wash-pulse {
          0%,100% { opacity: 0.75; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.07); }
        }

        /* Caption overlay */
        .lpg-caption {
          position: relative;
          z-index: 3;
          text-align: center;
          max-width: 420px;
        }
        .lpg-eyebrow {
          font-size: 0.656em;
          font-weight: 600;
          color: rgba(13,217,217,0.55);
          letter-spacing: 1.6px;
          text-transform: uppercase;
          margin-bottom: 13px;
        }
        .lpg-headline {
          font-family: 'EB Garamond', sans-serif;
          font-size: 1.875em;
          font-weight: 700;
          color: #E4EBF2;
          letter-spacing: -0.6px;
          line-height: 1.2;
          margin: 0 0 16px;
        }
        .lpg-headline em {
          font-style: normal;
          color: #0DD9D9;
        }
        .lpg-body {
          font-size: 0.813em;
          color: #3D4D5A;
          line-height: 1.65;
          margin: 0 0 26px;
        }

        /* Stats row */
        .lpg-stats {
          display: flex;
          gap: 36px;
          justify-content: center;
        }
        .lpg-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          animation: field-in 0.8s cubic-bezier(0.16,1,0.3,1) both;
        }
        .lpg-stat:nth-child(1) { animation-delay: 0.5s; }
        .lpg-stat:nth-child(2) { animation-delay: 0.65s; }
        .lpg-stat:nth-child(3) { animation-delay: 0.8s; }
        .lpg-stat-num {
          font-family: 'Fira Code', monospace;
          font-size: 1.375em;
          font-weight: 700;
          color: #0DD9D9;
          line-height: 1;
          letter-spacing: -0.5px;
        }
        .lpg-stat-num--amber { color: #F6A324; }
        .lpg-stat-lbl {
          font-size: 0.625em;
          color: #2E3D4A;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          font-weight: 500;
        }

        /* Network animations */
        .pg-node         { animation: node-glow  3.5s ease-in-out infinite; }
        .pg-node--risk   { animation: node-risk  2.8s ease-in-out infinite; }
        .pg-node--dim    { animation: node-dim   4.5s ease-in-out infinite; }
        .pg-edge         { animation: edge-pulse 4.2s ease-in-out infinite; }
        .pg-ripple       { animation: ripple-expand 3.2s ease-out infinite; transform-box: fill-box; transform-origin: center; }

        @keyframes node-glow {
          0%,100% { opacity: 0.82; }
          50%      { opacity: 0.32; }
        }
        @keyframes node-risk {
          0%,100% { opacity: 0.88; }
          40%      { opacity: 0.55; }
          70%      { opacity: 0.95; }
        }
        @keyframes node-dim {
          0%,100% { opacity: 0.28; }
          50%      { opacity: 0.11; }
        }
        @keyframes edge-pulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
        @keyframes ripple-expand {
          0%   { transform: scale(1);   opacity: 0.55; }
          100% { transform: scale(4);   opacity: 0; }
        }
      `}</style>

      {/* ── LEFT: POPULATION NETWORK PANEL ── */}
      <div className="lpg-viz" aria-hidden="true">
        <PopulationNetwork />
        <div className="lpg-brand">Medgnosis</div>
        <div className="lpg-caption">
          <p className="lpg-eyebrow">Population Intelligence</p>
          <h2 className="lpg-headline">
            Every patient.<br/><em>Every gap.</em> One view.
          </h2>
          <p className="lpg-body">
            Monitor chronic disease management across your entire panel.
            Surface high-risk patients before they deteriorate.
          </p>
          <div className="lpg-stats">
            <div className="lpg-stat">
              <span className="lpg-stat-num">1,288</span>
              <span className="lpg-stat-lbl">Active Patients</span>
            </div>
            <div className="lpg-stat">
              <span className="lpg-stat-num lpg-stat-num--amber">26,967</span>
              <span className="lpg-stat-lbl">Care Gaps</span>
            </div>
            <div className="lpg-stat">
              <span className="lpg-stat-num">45</span>
              <span className="lpg-stat-lbl">Bundles</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: FORM PANEL ── */}
      <div className="lpg-form">
        <div className="lpg-card">

          {/* Heading */}
          <div className="lpg-heading">
            <h2>Welcome back</h2>
            <p>Sign in to your clinical workspace</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate autoComplete="on">

            <div className="lpg-f">
              <label className="lpg-label" htmlFor="lpg-email">Email address</label>
              <div className="lpg-wrap">
                <input
                  id="lpg-email"
                  name="email"
                  type="email"
                  className="lpg-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  placeholder="clinician@hospital.org"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="lpg-f">
              <label className="lpg-label" htmlFor="lpg-pw">Password</label>
              <div className="lpg-wrap">
                <input
                  id="lpg-pw"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  className="lpg-input lpg-input--pw"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="lpg-pw-btn"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPw
                    ? <EyeOff size={17} strokeWidth={1.8}/>
                    : <Eye    size={17} strokeWidth={1.8}/>
                  }
                </button>
              </div>
            </div>

            <label className="lpg-remember">
              <input
                type="checkbox"
                className="lpg-check"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span className="lpg-check-label">Keep me signed in</span>
            </label>

            {error && (
              <div className="lpg-error" role="alert">
                <span className="lpg-error-icon">
                  <AlertCircle size={14} strokeWidth={2}/>
                </span>
                <span className="lpg-error-text">{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="lpg-submit"
              disabled={loading}
            >
              {loading && <span className="lpg-spin" aria-hidden="true"/>}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Demo quick-fill */}
          <div className="lpg-demo">
            <span className="lpg-demo-lbl">Quick demo</span>
            <button type="button" className="lpg-demo-btn" onClick={fillDemo}>
              Dr. Udoshi — Demo Account
            </button>
          </div>

          {/* Footer */}
          <div className="lpg-footer">
            <div className="lpg-hipaa">
              <span className="lpg-hipaa-dot"/>
              HIPAA · SOC 2 Type II
            </div>
            <div className="lpg-status">
              <span className="live-dot" aria-hidden="true"/>
              <span>All systems operational</span>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
