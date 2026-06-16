// =============================================================================
// Medgnosis Web — Real-time Surveillance (MEWS/NEWS2 + Glucometrics)
// "Catching deterioration before the code." Live unit census with a scored
// column, bedside drill-down, and the pharmacy-led glucometrics worklist.
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, HeartPulse, Droplet, RefreshCw } from 'lucide-react';
import { useToast } from '../stores/ui.js';
import { QueryError } from '../components/QueryError.js';
import { SeverityBadge, type Severity } from '../components/SeverityBadge.js';
import {
  useSurveillanceCensus,
  useSurveillanceDetail,
  useGlucoCensus,
  useGlucoDetail,
  useTick,
  type CensusRow,
} from '../hooks/useSurveillance.js';

// MEWS: 0-2 routine, 3 surveillance, 4 provider, 5+ RRT. NEWS2: 0-4 low, 5-6 med, 7+ high.
function scoreClass(scoreType: string, score: number | null): string {
  if (score == null) return 'text-ghost';
  const high = scoreType === 'MEWS' ? score >= 5 : score >= 7;
  const med = scoreType === 'MEWS' ? score >= 4 : score >= 5;
  const low = scoreType === 'MEWS' ? score >= 3 : score >= 1;
  if (high) return 'text-crimson';
  if (med) return 'text-amber';
  if (low) return 'text-gold';
  return 'text-emerald';
}

// Map an EWS score to a clinical severity level for redundant (non-color) display.
function scoreSeverity(scoreType: string, score: number | null): Severity | null {
  if (score == null) return null;
  if (scoreType === 'MEWS' ? score >= 5 : score >= 7) return 'critical';
  if (scoreType === 'MEWS' ? score >= 4 : score >= 5) return 'high';
  if (scoreType === 'MEWS' ? score >= 3 : score >= 1) return 'moderate';
  return null;
}

// Escalation band shown as an icon+text+color badge — so deterioration is never
// signalled by the colored score number alone.
function ScoreBand({ scoreType, score, band }: { scoreType: string; score: number | null; band?: string | null }) {
  const sev = scoreSeverity(scoreType, score);
  if (sev) return <SeverityBadge severity={sev} label={band ?? undefined} className="text-[10px]" />;
  return band ? <span className="text-xs text-dim">{band}</span> : null;
}

function Drilldown({ admissionId, scoreType }: { admissionId: number; scoreType: 'MEWS' | 'NEWS2' }) {
  const { data } = useSurveillanceDetail(admissionId);
  const vitals = data?.data?.vitals ?? [];
  const scores = (data?.data?.scores ?? []).filter((s) => s.score_type === scoreType);
  const latest = scores[0];
  const latestVital = vitals[0];

  return (
    <div className="border-t border-edge/20 p-4 bg-s1 space-y-3">
      {latest && (
        <div className="flex items-start gap-3">
          <span className={`text-3xl font-semibold tabular-nums ${scoreClass(scoreType, latest.score)}`}>{latest.score}</span>
          <div>
            <div className="text-sm text-bright">{scoreType} · {latest.band}</div>
            {latest.action && <div className="text-xs text-dim">{latest.action}</div>}
            <div className="text-[11px] text-ghost mt-1">
              components: {Object.entries(latest.components).map(([k, v]) => `${k}:${v}`).join('  ')}
            </div>
          </div>
        </div>
      )}
      {latestVital && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
          {[
            ['Temp °C', latestVital.temp_c], ['HR', latestVital.heart_rate], ['SBP', latestVital.systolic_bp],
            ['RR', latestVital.resp_rate], ['SpO₂', latestVital.spo2], ['GCS', latestVital.gcs],
          ].map(([label, val]) => (
            <div key={String(label)} className="card p-2 text-center">
              <div className="text-ghost text-[10px]">{label}</div>
              <div className="font-data tabular-nums text-bright">{val ?? '—'}</div>
            </div>
          ))}
        </div>
      )}
      <div className="text-[11px] text-ghost">
        {vitals.length} readings · live stream (vitals real-time; problem list nightly)
      </div>
    </div>
  );
}

function SurveillanceTab() {
  const [scoreType, setScoreType] = useState<'MEWS' | 'NEWS2'>('MEWS');
  const [open, setOpen] = useState<number | null>(null);
  const { data, isLoading, isError } = useSurveillanceCensus(scoreType);
  const census = data?.data?.census ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 border-b border-edge/30">
        {(['MEWS', 'NEWS2'] as const).map((t) => (
          <button key={t} onClick={() => setScoreType(t)}
            className={['px-3 py-2 text-sm font-ui border-b-2 -mb-px transition-colors',
              scoreType === t ? 'border-teal text-bright' : 'border-transparent text-dim hover:text-bright'].join(' ')}>
            {t}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="py-8 text-center text-dim">Loading census…</div>
      ) : isError ? (
        <QueryError what="the unit census" />
      ) : census.length === 0 ? (
        <div className="card p-8 text-center text-dim text-sm">No active admissions on the census.</div>
      ) : (
        <div className="space-y-1.5">
          {census.map((r: CensusRow) => (
            <div key={r.admission_id} className="card overflow-hidden">
              <button onClick={() => setOpen(open === r.admission_id ? null : r.admission_id)}
                className="w-full flex items-center justify-between p-3 hover:bg-s1 transition-colors text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-data text-xs text-dim w-20">{r.unit}/{r.bed}</span>
                  <Link to={`/patients/${r.patient_id}`} onClick={(e) => e.stopPropagation()}
                    className="font-medium text-bright hover:text-teal transition-colors truncate">{r.patient_name}</Link>
                  <span className="text-xs text-ghost truncate hidden md:inline">{r.admitting_dx}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <ScoreBand scoreType={scoreType} score={r.score} band={r.band} />
                  <span className={`text-xl font-semibold tabular-nums ${scoreClass(scoreType, r.score)}`}>{r.score ?? '—'}</span>
                </div>
              </button>
              {open === r.admission_id && <Drilldown admissionId={r.admission_id} scoreType={scoreType} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GlucoDrilldown({ admissionId }: { admissionId: number }) {
  const { data } = useGlucoDetail(admissionId);
  const d = data?.data;
  if (!d) return <div className="border-t border-edge/20 p-4 bg-s1 text-xs text-dim">Loading…</div>;
  return (
    <div className="border-t border-edge/20 p-4 bg-s1 space-y-3">
      <div className="flex gap-2 text-xs">
        <span className={`badge ${d.context.has_diabetes ? 'badge-info' : 'badge-dim'}`}>{d.context.has_diabetes ? 'DM on problem list' : 'No DM dx'}</span>
        <span className={`badge ${d.context.on_insulin ? 'badge-info' : 'badge-dim'}`}>{d.context.on_insulin ? 'On insulin' : 'No insulin'}</span>
      </div>
      <div>
        <div className="text-[11px] text-ghost mb-1">Glucose (last readings, live)</div>
        <div className="flex gap-1 flex-wrap">
          {d.glucose.slice(0, 12).map((g, i) => (
            <span key={i} className={`font-data tabular-nums text-xs px-1.5 py-0.5 rounded ${g.glucose_mgdl >= 300 ? 'bg-crimson/15 text-crimson' : g.glucose_mgdl >= 180 ? 'bg-amber/15 text-amber' : 'text-dim'}`}>{g.glucose_mgdl}</span>
          ))}
        </div>
      </div>
      {d.insulin.length > 0 && (
        <div>
          <div className="text-[11px] text-ghost mb-1">Insulin ledger</div>
          {d.insulin.slice(0, 5).map((ins, i) => (
            <div key={i} className="text-xs text-dim font-data">{ins.admin_datetime.slice(0, 16).replace('T', ' ')} · {ins.dose_units}u · {ins.product.split(' ')[0]} {ins.product.split(' ')[1]}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function GlucometricsTab() {
  const [open, setOpen] = useState<number | null>(null);
  const { data, isLoading, isError } = useGlucoCensus();
  const census = data?.data?.census ?? [];
  return (
    <div className="space-y-3">
      {data?.data && (
        <div className="text-sm text-dim">{data.data.high_risk} of {data.data.total} beds high-risk</div>
      )}
      {isLoading ? (
        <div className="py-8 text-center text-dim">Loading…</div>
      ) : isError ? (
        <QueryError what="the glucometrics census" />
      ) : census.length === 0 ? (
        <div className="card p-8 text-center text-dim text-sm">No active admissions on the census.</div>
      ) : (
        <div className="space-y-1.5">
          {census.map((r) => (
            <div key={r.admission_id} className="card overflow-hidden">
              <button onClick={() => setOpen(open === r.admission_id ? null : r.admission_id)}
                className="w-full flex items-center justify-between p-3 hover:bg-s1 transition-colors text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-data text-xs text-dim w-20">{r.unit}/{r.bed}</span>
                  <Link to={`/patients/${r.patient_id}`} onClick={(e) => e.stopPropagation()}
                    className="font-medium text-bright hover:text-teal transition-colors truncate">{r.patient_name}</Link>
                  {r.reasons.map((reason) => (
                    <span key={reason} className="badge badge-amber text-[10px]">{reason.replace(/_/g, ' ')}</span>
                  ))}
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 text-xs">
                  <span className="text-dim">avg <span className={`font-data tabular-nums ${(r.avg_24h ?? 0) >= 180 ? 'text-amber' : 'text-bright'}`}>{r.avg_24h ?? '—'}</span></span>
                  <span className="text-dim">max <span className={`font-data tabular-nums ${(r.max_24h ?? 0) >= 300 ? 'text-crimson' : 'text-bright'}`}>{r.max_24h ?? '—'}</span></span>
                </div>
              </button>
              {open === r.admission_id && <GlucoDrilldown admissionId={r.admission_id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SurveillancePage() {
  const [tab, setTab] = useState<'ews' | 'gluco'>('ews');
  const tick = useTick();
  const toast = useToast();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Activity size={22} strokeWidth={1.5} className="text-teal" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-bright">Real-Time Surveillance</h1>
        </div>
        <button onClick={() => tick.mutate(undefined, { onSuccess: () => toast.success('Stream advanced'), onError: () => toast.error('Tick failed') })}
          disabled={tick.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-xs font-ui border border-edge/35 text-dim hover:text-teal hover:border-teal/40 transition-colors disabled:opacity-50">
          <RefreshCw size={13} strokeWidth={2} className={tick.isPending ? 'animate-spin' : ''} aria-hidden="true" /> Advance stream
        </button>
      </div>
      <p className="text-sm text-dim max-w-2xl">
        Vitals scored continuously off the live feed; glucose triaged by the inpatient pharmacy.
        The only code that matters is the one you never have to call.
      </p>

      <div className="flex items-center gap-2">
        <button onClick={() => setTab('ews')}
          className={['flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-sm font-ui border transition-colors',
            tab === 'ews' ? 'border-teal/50 text-bright bg-teal/5' : 'border-edge/35 text-dim hover:text-bright'].join(' ')}>
          <HeartPulse size={14} aria-hidden="true" /> Early Warning
        </button>
        <button onClick={() => setTab('gluco')}
          className={['flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-sm font-ui border transition-colors',
            tab === 'gluco' ? 'border-teal/50 text-bright bg-teal/5' : 'border-edge/35 text-dim hover:text-bright'].join(' ')}>
          <Droplet size={14} aria-hidden="true" /> Glucometrics
        </button>
      </div>

      {tab === 'ews' ? <SurveillanceTab /> : <GlucometricsTab />}
    </div>
  );
}
