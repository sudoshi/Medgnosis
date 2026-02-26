// =============================================================================
// Medgnosis — Encounter Note Page (SOAP Editor + AI Scribe)
// Full-page clinical documentation with TipTap rich text editors
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Save,
  Lock,
  Sparkles,
  Loader2,
  ChevronDown,
  Trash2,
  FileEdit,
} from 'lucide-react';
import { api } from '../services/api.js';
import {
  useCreateClinicalNote,
  useUpdateClinicalNote,
  useFinalizeClinicalNote,
  useAiScribe,
} from '../hooks/useApi.js';
import { SOAPSectionEditor } from '../components/encounter/SOAPSectionEditor.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type VisitType = 'initial' | 'followup' | 'procedure' | 'telehealth';
type SOAPSection = 'subjective' | 'objective' | 'assessment' | 'plan_text';

interface NoteData {
  note_id: string;
  patient_id: number;
  visit_type: VisitType;
  status: 'draft' | 'finalized' | 'amended';
  chief_complaint: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan_text: string | null;
  ai_generated: { sections: string[]; model: string; generated_at: string } | null;
  finalized_at: string | null;
  created_date: string;
  updated_date: string;
  author_name?: string;
}

const VISIT_TYPES: { value: VisitType; label: string }[] = [
  { value: 'followup', label: 'Follow-Up' },
  { value: 'initial', label: 'Initial Visit' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'telehealth', label: 'Telehealth' },
];

const SOAP_SECTIONS: { key: SOAPSection; label: string; placeholder: string }[] = [
  {
    key: 'subjective',
    label: 'Subjective',
    placeholder: 'Patient-reported symptoms, history of present illness, review of systems...',
  },
  {
    key: 'objective',
    label: 'Objective',
    placeholder: 'Physical exam findings, vitals, lab results, imaging...',
  },
  {
    key: 'assessment',
    label: 'Assessment',
    placeholder: 'Clinical assessment, differential diagnosis, problem list...',
  },
  {
    key: 'plan_text',
    label: 'Plan',
    placeholder: 'Treatment plan, orders, prescriptions, follow-up, referrals...',
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function EncounterNotePage() {
  const { patientId } = useParams<{ patientId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const existingNoteId = searchParams.get('noteId');

  // State
  const [noteId, setNoteId] = useState<string | null>(existingNoteId);
  const [visitType, setVisitType] = useState<VisitType>('followup');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [soapContent, setSoapContent] = useState<Record<SOAPSection, string>>({
    subjective: '',
    objective: '',
    assessment: '',
    plan_text: '',
  });
  const [noteStatus, setNoteStatus] = useState<'draft' | 'finalized' | 'amended'>('draft');
  const [aiSections, setAiSections] = useState<Set<string>>(new Set());
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  // Queries
  const { data: patientData } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => api.get(`/patients/${patientId}`),
    enabled: !!patientId,
  });

  const patient = patientData?.data as {
    id: number;
    first_name: string;
    last_name: string;
    mrn: string;
  } | undefined;

  // Mutations
  const createNote = useCreateClinicalNote();
  const updateNote = useUpdateClinicalNote();
  const finalizeNote = useFinalizeClinicalNote();
  const aiScribe = useAiScribe();

  // Load existing note if noteId provided
  const { data: existingNoteData } = useQuery({
    queryKey: ['clinical-note', existingNoteId],
    queryFn: () => api.get<NoteData>(`/clinical-notes/${existingNoteId}`),
    enabled: !!existingNoteId,
  });

  useEffect(() => {
    if (existingNoteData?.data && !initialized.current) {
      const note = existingNoteData.data as NoteData;
      setNoteId(note.note_id);
      setVisitType(note.visit_type);
      setChiefComplaint(note.chief_complaint ?? '');
      setSoapContent({
        subjective: note.subjective ?? '',
        objective: note.objective ?? '',
        assessment: note.assessment ?? '',
        plan_text: note.plan_text ?? '',
      });
      setNoteStatus(note.status);
      if (note.ai_generated?.sections) {
        setAiSections(new Set(note.ai_generated.sections));
      }
      initialized.current = true;
    }
  }, [existingNoteData]);

  // Create draft note on first load (if no existing note)
  useEffect(() => {
    if (!existingNoteId && patientId && !noteId && !createNote.isPending && !initialized.current) {
      initialized.current = true;
      createNote.mutate(
        { patient_id: Number(patientId), visit_type: visitType },
        {
          onSuccess: (data) => {
            const created = data?.data as { note_id: string } | undefined;
            if (created?.note_id) {
              setNoteId(created.note_id);
            }
          },
        },
      );
    }
  }, [patientId, existingNoteId, noteId, createNote, visitType]);

  // Auto-save debounce
  const triggerAutoSave = useCallback(() => {
    if (!noteId || noteStatus !== 'draft') return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      setSaveIndicator('saving');
      updateNote.mutate(
        {
          noteId,
          data: {
            chief_complaint: chiefComplaint || undefined,
            ...soapContent,
            visit_type: visitType,
          },
        },
        {
          onSuccess: () => {
            setSaveIndicator('saved');
            setTimeout(() => setSaveIndicator('idle'), 2000);
          },
          onError: () => setSaveIndicator('idle'),
        },
      );
    }, 3000);
  }, [noteId, noteStatus, chiefComplaint, soapContent, visitType, updateNote]);

  // Update section content
  const handleSectionChange = useCallback(
    (section: SOAPSection, content: string) => {
      setSoapContent((prev) => ({ ...prev, [section]: content }));
      triggerAutoSave();
    },
    [triggerAutoSave],
  );

  // Manual save
  const handleSave = useCallback(() => {
    if (!noteId || noteStatus !== 'draft') return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    setSaveIndicator('saving');
    updateNote.mutate(
      {
        noteId,
        data: {
          chief_complaint: chiefComplaint || undefined,
          ...soapContent,
          visit_type: visitType,
        },
      },
      {
        onSuccess: () => {
          setSaveIndicator('saved');
          setTimeout(() => setSaveIndicator('idle'), 2000);
        },
        onError: () => setSaveIndicator('idle'),
      },
    );
  }, [noteId, noteStatus, chiefComplaint, soapContent, visitType, updateNote]);

  // AI Scribe — single section
  const handleAiGenerate = useCallback(
    (section: SOAPSection) => {
      if (!patientId) return;
      setGeneratingSection(section);

      aiScribe.mutate(
        {
          patient_id: Number(patientId),
          visit_type: visitType,
          sections: [section],
          chief_complaint: chiefComplaint || undefined,
          existing_content: soapContent,
        },
        {
          onSuccess: (data) => {
            const resp = data?.data as {
              sections: Record<string, string>;
            } | undefined;
            if (resp?.sections?.[section]) {
              setSoapContent((prev) => ({
                ...prev,
                [section]: resp.sections[section],
              }));
              setAiSections((prev) => new Set([...prev, section]));
              triggerAutoSave();
            }
            setGeneratingSection(null);
          },
          onError: () => setGeneratingSection(null),
        },
      );
    },
    [patientId, visitType, chiefComplaint, soapContent, aiScribe, triggerAutoSave],
  );

  // AI Scribe — all sections
  const handleAiScribeAll = useCallback(() => {
    if (!patientId) return;
    setGeneratingSection('all');

    const allSections: SOAPSection[] = ['subjective', 'objective', 'assessment', 'plan_text'];
    aiScribe.mutate(
      {
        patient_id: Number(patientId),
        visit_type: visitType,
        sections: allSections,
        chief_complaint: chiefComplaint || undefined,
        existing_content: soapContent,
      },
      {
        onSuccess: (data) => {
          const resp = data?.data as {
            sections: Record<string, string>;
          } | undefined;
          if (resp?.sections) {
            setSoapContent((prev) => ({
              ...prev,
              ...resp.sections,
            }));
            setAiSections(new Set(Object.keys(resp.sections)));
            triggerAutoSave();
          }
          setGeneratingSection(null);
        },
        onError: () => setGeneratingSection(null),
      },
    );
  }, [patientId, visitType, chiefComplaint, soapContent, aiScribe, triggerAutoSave]);

  // Finalize
  const handleFinalize = useCallback(() => {
    if (!noteId) return;
    // Save first, then finalize
    updateNote.mutate(
      {
        noteId,
        data: {
          chief_complaint: chiefComplaint || undefined,
          ...soapContent,
          visit_type: visitType,
        },
      },
      {
        onSuccess: () => {
          finalizeNote.mutate(noteId, {
            onSuccess: () => {
              setNoteStatus('finalized');
              setShowFinalizeDialog(false);
            },
          });
        },
      },
    );
  }, [noteId, chiefComplaint, soapContent, visitType, updateNote, finalizeNote]);

  const isReadOnly = noteStatus !== 'draft';
  const isGenerating = generatingSection !== null;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!patient) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="surface space-y-4">
          <div className="skeleton h-8 w-64 rounded" />
          <div className="skeleton h-48 rounded-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        to={`/patients/${patientId}`}
        className="inline-flex items-center gap-1.5 text-xs text-ghost hover:text-dim transition-colors font-ui"
      >
        <ArrowLeft size={13} strokeWidth={1.5} />
        Back to Patient
      </Link>

      {/* Header */}
      <div className="surface animate-fade-up">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <FileEdit size={20} strokeWidth={1.5} className="text-teal" />
            <div>
              <h1 className="text-lg font-bold text-bright">Encounter Note</h1>
              <p className="text-xs text-dim">
                {patient.last_name}, {patient.first_name}
                <span className="mx-1.5 text-ghost">·</span>
                <span className="font-data tabular-nums">MRN {patient.mrn}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Save indicator */}
            {saveIndicator === 'saving' && (
              <span className="text-xs text-ghost flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> Saving...
              </span>
            )}
            {saveIndicator === 'saved' && (
              <span className="text-xs text-emerald">Saved</span>
            )}

            {/* Status badge */}
            <span
              className={
                noteStatus === 'draft'
                  ? 'badge-dim'
                  : noteStatus === 'finalized'
                    ? 'badge-emerald'
                    : 'badge-amber'
              }
            >
              {noteStatus === 'draft' && 'DRAFT'}
              {noteStatus === 'finalized' && 'FINALIZED'}
              {noteStatus === 'amended' && 'AMENDED'}
            </span>
          </div>
        </div>
      </div>

      {/* Visit Type + Chief Complaint + AI Scribe All */}
      <div className="surface animate-fade-up stagger-1">
        <div className="flex items-end gap-4 flex-wrap">
          {/* Visit type */}
          <div className="flex-shrink-0">
            <label className="label-text mb-1 block">Visit Type</label>
            <div className="relative">
              <select
                value={visitType}
                onChange={(e) => {
                  setVisitType(e.target.value as VisitType);
                  triggerAutoSave();
                }}
                disabled={isReadOnly}
                className="input-field pr-8 appearance-none cursor-pointer w-40"
              >
                {VISIT_TYPES.map((vt) => (
                  <option key={vt.value} value={vt.value}>
                    {vt.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ghost pointer-events-none"
              />
            </div>
          </div>

          {/* Chief complaint */}
          <div className="flex-1 min-w-[200px]">
            <label className="label-text mb-1 block">Chief Complaint</label>
            <input
              type="text"
              value={chiefComplaint}
              onChange={(e) => {
                setChiefComplaint(e.target.value);
                triggerAutoSave();
              }}
              placeholder="Reason for visit..."
              disabled={isReadOnly}
              className="input-field w-full"
            />
          </div>

          {/* AI Scribe All button */}
          {!isReadOnly && (
            <button
              onClick={handleAiScribeAll}
              disabled={isGenerating}
              className="btn-primary btn-sm gap-1.5 flex-shrink-0"
            >
              {generatingSection === 'all' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              AI Scribe All
            </button>
          )}
        </div>
      </div>

      {/* SOAP Sections */}
      {SOAP_SECTIONS.map((section, idx) => (
        <div
          key={section.key}
          className={`animate-fade-up stagger-${idx + 2}`}
        >
          <SOAPSectionEditor
            section={section.key}
            label={section.label}
            placeholder={section.placeholder}
            value={soapContent[section.key]}
            onChange={(content) => handleSectionChange(section.key, content)}
            onAiGenerate={() => handleAiGenerate(section.key)}
            isGenerating={
              generatingSection === section.key || generatingSection === 'all'
            }
            isAiGenerated={aiSections.has(section.key)}
            readOnly={isReadOnly}
          />
        </div>
      ))}

      {/* Action bar */}
      <div className="surface animate-fade-up stagger-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!isReadOnly && noteId && (
              <button
                onClick={() => {
                  if (confirm('Delete this draft note?')) {
                    api.delete(`/clinical-notes/${noteId}`).then(() => {
                      navigate(`/patients/${patientId}`);
                    });
                  }
                }}
                className="btn-ghost btn-sm gap-1.5 text-crimson hover:text-crimson"
              >
                <Trash2 size={13} />
                Delete Draft
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!isReadOnly && (
              <>
                <button
                  onClick={handleSave}
                  disabled={updateNote.isPending}
                  className="btn-secondary btn-sm gap-1.5"
                >
                  <Save size={13} />
                  Save Draft
                </button>
                <button
                  onClick={() => setShowFinalizeDialog(true)}
                  disabled={finalizeNote.isPending}
                  className="btn-primary btn-sm gap-1.5"
                >
                  <Lock size={13} />
                  Finalize & Sign
                </button>
              </>
            )}
            {isReadOnly && (
              <span className="text-xs text-dim">
                This note has been {noteStatus}. It is read-only.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Finalize confirmation dialog */}
      {showFinalizeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="surface max-w-md w-full mx-4 space-y-4">
            <h2 className="text-lg font-bold text-bright">Finalize & Sign Note</h2>
            <p className="text-sm text-dim">
              Once finalized, this note will be locked and cannot be edited.
              You can amend it later if needed.
            </p>
            <p className="text-xs text-ghost">
              By signing, you attest that this documentation is accurate and complete.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowFinalizeDialog(false)}
                className="btn-ghost btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalize}
                disabled={finalizeNote.isPending}
                className="btn-primary btn-sm gap-1.5"
              >
                {finalizeNote.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Lock size={13} />
                )}
                Finalize & Sign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
