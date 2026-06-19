import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, LogIn, ShieldCheck } from 'lucide-react';
import { api, apiErrorMessage } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';

interface SmartLaunchCompletion {
  smart_session_id: string;
  ehr_tenant_id: number;
  patient_id: number | null;
  patient_sync?: {
    status?: string;
    errorMessage?: string;
  } | null;
  launch_context: Record<string, unknown>;
}

function readInitialHandoff(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return params.get('smart_handoff')?.trim() ?? '';
}

function completionReturnTo(handoff: string): string {
  return `/ehr/complete?smart_handoff=${encodeURIComponent(handoff)}`;
}

export function SmartLaunchCompletePage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoadingAuth = useAuthStore((state) => state.isLoading);
  const handoffRef = useRef(readInitialHandoff());
  const completedRef = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (handoffRef.current) {
      window.history.replaceState(null, '', '/ehr/complete');
    }
  }, []);

  useEffect(() => {
    if (isLoadingAuth || !isAuthenticated || completedRef.current || !handoffRef.current) return;
    completedRef.current = true;

    api.post<SmartLaunchCompletion>('/ehr/launch/complete', {
      smart_handoff: handoffRef.current,
    })
      .then((res) => {
        const completion = res.data;
        if (!completion) {
          throw new Error(res.error?.message ?? 'EHR launch could not complete.');
        }
        if (completion.patient_sync?.status === 'failed') {
          throw new Error(completion.patient_sync.errorMessage ?? 'EHR patient context could not be imported.');
        }
        if (completion.patient_id) {
          navigate(`/patients/${completion.patient_id}`, { replace: true });
          return;
        }
        navigate('/dashboard', { replace: true });
      })
      .catch((err: unknown) => {
        completedRef.current = false;
        setError(apiErrorMessage(err, 'EHR launch could not complete.'));
      });
  }, [isAuthenticated, isLoadingAuth, navigate]);

  const handoff = handoffRef.current;
  const needsSignIn = !isLoadingAuth && !isAuthenticated && handoff;
  const missingHandoff = !handoff;

  return (
    <div className="flex min-h-screen items-center justify-center bg-void px-4">
      <div className="surface w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-card bg-[var(--primary-bg)] text-[var(--primary)]">
          {error || missingHandoff ? <AlertTriangle size={22} strokeWidth={1.7} /> : <ShieldCheck size={22} strokeWidth={1.7} />}
        </div>
        <h1 className="text-lg font-semibold text-bright">
          {error || missingHandoff ? 'EHR launch needs attention' : needsSignIn ? 'Sign in to finish EHR launch' : 'Completing EHR launch'}
        </h1>
        <p className="mt-2 text-sm text-ghost">
          {missingHandoff
            ? 'The launch handoff is missing or expired.'
            : error || (needsSignIn ? 'Use your Medgnosis account to open the launched patient context.' : 'Binding the launch to your Medgnosis session...')}
        </p>
        {needsSignIn && (
          <button
            type="button"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-btn bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-accent-fg"
            onClick={() => navigate(`/login?return_to=${encodeURIComponent(completionReturnTo(handoff))}`, { replace: true })}
          >
            <LogIn size={16} strokeWidth={1.8} />
            Sign in
          </button>
        )}
        {(error || missingHandoff) && (
          <button
            type="button"
            className="mt-5 rounded-btn bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-accent-fg"
            onClick={() => navigate('/dashboard', { replace: true })}
          >
            Return to dashboard
          </button>
        )}
      </div>
    </div>
  );
}
