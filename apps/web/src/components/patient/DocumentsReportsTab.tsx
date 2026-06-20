// =============================================================================
// Medgnosis — Documents & Reports Tab
// DiagnosticReport + DocumentReference resources hydrated from EHR ingestion.
// =============================================================================

import { usePatientDiagnosticReports, usePatientDocuments } from '../../hooks/useApi.js';
import { FileText, FlaskConical, ExternalLink } from 'lucide-react';

interface DocumentsReportsTabProps {
  patientId: string;
}

interface DiagnosticReportRow {
  id: number;
  code: string | null;
  name: string | null;
  code_system: string | null;
  category: string | null;
  status: string | null;
  effective_datetime: string | null;
  issued_datetime: string | null;
  performer: string | null;
  conclusion: string | null;
}

interface DocumentRow {
  id: number;
  code: string | null;
  name: string | null;
  category: string | null;
  status: string | null;
  doc_status: string | null;
  content_type: string | null;
  content_url: string | null;
  content_title: string | null;
  author_display: string | null;
  document_datetime: string | null;
}

function statusBadge(status: string | null) {
  const s = (status || '').toLowerCase();
  if (s === 'final' || s === 'current' || s === 'completed' || s === 'amended') return 'badge-teal';
  if (s === 'preliminary' || s === 'registered' || s === 'partial') return 'badge-amber';
  if (s === 'entered-in-error' || s === 'cancelled' || s === 'superseded') return 'badge-crimson';
  return 'badge-dim';
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return null;
  }
}

export function DocumentsReportsTab({ patientId }: DocumentsReportsTabProps) {
  const reportsQuery = usePatientDiagnosticReports(patientId);
  const documentsQuery = usePatientDocuments(patientId);

  const reports = (reportsQuery.data?.data ?? []) as DiagnosticReportRow[];
  const documents = (documentsQuery.data?.data ?? []) as DocumentRow[];

  const isLoading = reportsQuery.isLoading || documentsQuery.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-md bg-s1" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Diagnostic Reports */}
      <section>
        <header className="mb-3 flex items-center gap-2">
          <FlaskConical size={15} strokeWidth={1.5} className="text-teal" />
          <h3 className="text-sm font-semibold text-fg">Diagnostic Reports</h3>
          <span className="badge-dim">{reports.length}</span>
        </header>

        {reports.length === 0 ? (
          <p className="rounded-md border border-edge/30 bg-s1 px-4 py-6 text-center text-sm text-fg-dim">
            No diagnostic reports on file.
          </p>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li
                key={r.id}
                className="rounded-md border-l-2 border-l-teal/60 bg-s1 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">
                      {r.name || r.code || 'Diagnostic report'}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-dim">
                      {[r.category, r.code_system && r.code ? `${r.code_system} ${r.code}` : r.code, r.performer]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {r.conclusion && (
                      <p className="mt-1 text-xs text-fg-muted line-clamp-2">{r.conclusion}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {r.status && <span className={statusBadge(r.status)}>{r.status}</span>}
                    <p className="mt-1 text-xs text-fg-dim">
                      {formatDate(r.effective_datetime || r.issued_datetime)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Documents */}
      <section>
        <header className="mb-3 flex items-center gap-2">
          <FileText size={15} strokeWidth={1.5} className="text-violet" />
          <h3 className="text-sm font-semibold text-fg">Documents</h3>
          <span className="badge-dim">{documents.length}</span>
        </header>

        {documents.length === 0 ? (
          <p className="rounded-md border border-edge/30 bg-s1 px-4 py-6 text-center text-sm text-fg-dim">
            No documents on file.
          </p>
        ) : (
          <ul className="space-y-2">
            {documents.map((d) => (
              <li
                key={d.id}
                className="rounded-md border-l-2 border-l-violet/50 bg-s1 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">
                      {d.content_title || d.name || 'Document'}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-dim">
                      {[d.category, d.name && d.name !== d.content_title ? d.name : null, d.content_type, d.author_display]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {(d.doc_status || d.status) && (
                      <span className={statusBadge(d.doc_status || d.status)}>{d.doc_status || d.status}</span>
                    )}
                    <p className="mt-1 text-xs text-fg-dim">{formatDate(d.document_datetime)}</p>
                    {d.content_url && (
                      <a
                        href={d.content_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-teal hover:underline"
                      >
                        Open <ExternalLink size={11} strokeWidth={1.5} />
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
