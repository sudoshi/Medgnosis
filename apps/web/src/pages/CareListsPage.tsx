// =============================================================================
// Medgnosis Web — Care Lists  (Tier 6: CDS Hooks Order Placement)
// Bundle-grouped care gap worklist with FHIR order placement
// =============================================================================

import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ListChecks,
  Search,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  AlertCircle,
  Users,
  FileCode2,
  X,
  Send,
  Stethoscope,
  FlaskConical,
  Image as ImageIcon,
  Pill,
  ClipboardList,
  Zap,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useOrderWorklist, usePlaceOrder, usePlaceOrderBatch } from '../hooks/useApi.js';
import { PatientAvatar, getInitials } from '../components/PatientAvatar.js';
import { Pagination } from '../components/Pagination.js';
import { useToast } from '../stores/ui.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  item_id: number;
  item_name: string;
  item_type: string;
  loinc_code: string | null;
  loinc_description: string | null;
  cpt_code: string | null;
  cpt_description: string | null;
  frequency: string | null;
  guideline_source: string | null;
}

interface WorklistMeasure {
  measure_code: string;
  measure_name: string;
  care_gap_id: number;
  gap_status: string;
  gap_priority: string | null;
  due_date: string | null;
  orders: OrderItem[];
}

interface WorklistBundle {
  bundle_code: string;
  condition_name: string;
  measures: WorklistMeasure[];
}

interface WorklistPatient {
  patient_id: number;
  patient_name: string;
  mrn: string;
  total_open_gaps: number;
  actionable_orders: number;
  bundles: WorklistBundle[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const itemTypeIcon: Record<string, typeof FlaskConical> = {
  lab: FlaskConical,
  imaging: ImageIcon,
  medication: Pill,
  referral: ClipboardList,
  procedure: Stethoscope,
};

function ItemTypeBadge({ type }: { type: string }) {
  const Icon = itemTypeIcon[type] ?? Stethoscope;
  const colors: Record<string, string> = {
    lab: 'bg-teal/10 text-teal border-teal/20',
    imaging: 'bg-violet/10 text-violet border-violet/20',
    medication: 'bg-amber/10 text-amber border-amber/20',
    referral: 'bg-cyan/10 text-cyan border-cyan/20',
    procedure: 'bg-dim/10 text-dim border-dim/20',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-ui font-medium border capitalize ${colors[type] ?? colors.procedure}`}>
      <Icon size={10} strokeWidth={1.5} />
      {type}
    </span>
  );
}

function PriorityDot({ priority }: { priority: string | null }) {
  if (!priority) return null;
  const colors: Record<string, string> = {
    high: 'bg-crimson',
    medium: 'bg-amber',
    low: 'bg-emerald',
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[priority] ?? 'bg-dim'}`}
      title={`${priority} priority`}
    />
  );
}

// ─── MeasureRow ───────────────────────────────────────────────────────────────

function MeasureRow({
  measure,
  patientId,
  onPlaceOrder,
}: {
  measure: WorklistMeasure;
  patientId: number;
  onPlaceOrder: (order: OrderItem, measure: WorklistMeasure, patientId: number) => void;
}) {
  const order = measure.orders[0]; // Primary order for this measure
  const isOrdered = measure.gap_status === 'in_progress';

  return (
    <div className="flex items-center gap-3 py-2 px-4 ml-12 border-b border-edge/10 last:border-0 group">
      {/* Priority + measure name */}
      <PriorityDot priority={measure.gap_priority} />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-dim">{measure.measure_name}</span>
      </div>

      {/* LOINC / CPT codes */}
      <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
        {order?.loinc_code && (
          <span className="font-data text-[10px] text-ghost tabular-nums bg-s1 px-1.5 py-0.5 rounded">
            LOINC {order.loinc_code}
          </span>
        )}
        {order?.cpt_code && (
          <span className="font-data text-[10px] text-ghost tabular-nums bg-s1 px-1.5 py-0.5 rounded">
            CPT {order.cpt_code}
          </span>
        )}
      </div>

      {/* Order type badge */}
      {order && (
        <div className="hidden md:block flex-shrink-0">
          <ItemTypeBadge type={order.item_type} />
        </div>
      )}

      {/* Status / Action */}
      <div className="flex-shrink-0 w-[110px] flex justify-end">
        {isOrdered ? (
          <span className="badge bg-blue/10 text-blue border-blue/20">Ordered</span>
        ) : order ? (
          <button
            onClick={() => onPlaceOrder(order, measure, patientId)}
            className={[
              'flex items-center gap-1 px-2.5 py-1 rounded-btn text-xs font-ui',
              'border border-teal/30 text-teal bg-teal/5',
              'hover:bg-teal/15 hover:border-teal/50',
              'transition-colors duration-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50',
            ].join(' ')}
          >
            <Send size={10} strokeWidth={2} />
            Place Order
          </button>
        ) : (
          <span className="text-[10px] text-ghost">No order</span>
        )}
      </div>
    </div>
  );
}

// ─── BundleSection ────────────────────────────────────────────────────────────

function BundleSection({
  bundle,
  patientId,
  onPlaceOrder,
}: {
  bundle: WorklistBundle;
  patientId: number;
  onPlaceOrder: (order: OrderItem, measure: WorklistMeasure, patientId: number) => void;
}) {
  const openCount = bundle.measures.filter((m) => m.gap_status !== 'in_progress').length;
  const orderedCount = bundle.measures.filter((m) => m.gap_status === 'in_progress').length;

  return (
    <div className="ml-6 border-l-2 border-edge/20 mb-1">
      {/* Bundle header */}
      <div className="flex items-center gap-2 px-4 py-1.5">
        <span className="font-ui text-[10px] font-semibold uppercase tracking-wider text-ghost bg-s1 px-1.5 py-0.5 rounded">
          {bundle.bundle_code}
        </span>
        <span className="text-xs font-medium text-dim">{bundle.condition_name}</span>
        <span className="font-data text-[10px] text-ghost tabular-nums">
          {openCount} open{orderedCount > 0 ? `, ${orderedCount} ordered` : ''}
        </span>
      </div>

      {/* Measures */}
      {bundle.measures.map((measure) => (
        <MeasureRow
          key={measure.care_gap_id}
          measure={measure}
          patientId={patientId}
          onPlaceOrder={onPlaceOrder}
        />
      ))}
    </div>
  );
}

// ─── PatientBundleGroup ───────────────────────────────────────────────────────

function PatientBundleGroup({
  patient,
  onPlaceOrder,
  onOrderAll,
  isOrderingAll,
  defaultOpen = false,
}: {
  patient: WorklistPatient;
  onPlaceOrder: (order: OrderItem, measure: WorklistMeasure, patientId: number) => void;
  onOrderAll: (patient: WorklistPatient) => void;
  isOrderingAll: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const initials = getInitials(patient.patient_name);

  // Collect all actionable orders (open gaps with at least one order available)
  const actionableCount = patient.bundles.reduce(
    (sum, b) => sum + b.measures.filter((m) => m.gap_status !== 'in_progress' && m.orders.length > 0).length, 0,
  );

  return (
    <div className="border-b border-edge/20">
      {/* Patient header row */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-s1 transition-colors duration-100 select-none"
        aria-expanded={open}
      >
        <span className="text-ghost transition-transform duration-150">
          {open ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
        </span>

        <PatientAvatar initials={initials} seed={patient.patient_id} size="sm" />

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <Link
              to={`/patients/${patient.patient_id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium text-bright hover:text-teal transition-colors truncate"
            >
              {patient.patient_name}
            </Link>
            <span className="font-data text-[10px] text-ghost tabular-nums">MRN {patient.mrn}</span>
          </div>
          <p className="text-xs text-ghost mt-0.5">
            {patient.bundles.length} bundle{patient.bundles.length !== 1 ? 's' : ''} &middot;{' '}
            {patient.total_open_gaps} open gap{patient.total_open_gaps !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Actionable orders count */}
        {patient.actionable_orders > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-ui font-medium border bg-teal/10 text-teal border-teal/20">
            <ShoppingCart size={10} strokeWidth={1.5} />
            {patient.actionable_orders} orderable
          </span>
        )}

        {/* Order All button */}
        {actionableCount > 1 && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onOrderAll(patient); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onOrderAll(patient); } }}
            className={[
              'flex items-center gap-1.5 px-3 py-1 rounded-btn text-xs font-ui font-medium',
              'border border-violet/30 text-violet bg-violet/5',
              'hover:bg-violet/15 hover:border-violet/50',
              'transition-colors duration-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/50',
              isOrderingAll ? 'opacity-50 pointer-events-none' : '',
            ].join(' ')}
            aria-label={`Order all ${actionableCount} items for ${patient.patient_name}`}
          >
            {isOrderingAll ? (
              <Loader2 size={11} strokeWidth={2} className="animate-spin" />
            ) : (
              <Zap size={11} strokeWidth={2} />
            )}
            Order All ({actionableCount})
          </span>
        )}
      </button>

      {/* Expanded: bundles + measures */}
      {open && (
        <div className="pb-3">
          {patient.bundles.map((bundle) => (
            <BundleSection
              key={bundle.bundle_code}
              bundle={bundle}
              patientId={patient.patient_id}
              onPlaceOrder={onPlaceOrder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── OrderPanel (Slide-over) ──────────────────────────────────────────────────

function OrderPanel({
  order,
  measure,
  patientId,
  patientName,
  onClose,
  onConfirm,
  isPlacing,
}: {
  order: OrderItem;
  measure: WorklistMeasure;
  patientId: number;
  patientName: string;
  onClose: () => void;
  onConfirm: (priority: string, instructions: string) => void;
  isPlacing: boolean;
}) {
  const [priority, setPriority] = useState('routine');
  const [instructions, setInstructions] = useState('');

  // Build a preview FHIR ServiceRequest
  const fhirPreview = {
    resourceType: 'ServiceRequest',
    status: 'draft',
    intent: 'order',
    priority,
    code: {
      coding: [
        ...(order.loinc_code ? [{ system: 'http://loinc.org', code: order.loinc_code, display: order.loinc_description }] : []),
        ...(order.cpt_code ? [{ system: 'http://www.ama-assn.org/go/cpt', code: order.cpt_code, display: order.cpt_description }] : []),
      ],
    },
    subject: { reference: `Patient/${patientId}`, display: patientName },
    authoredOn: new Date().toISOString(),
    ...(instructions ? { note: [{ text: instructions }] } : {}),
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-s0 border-l border-edge/40 shadow-2xl overflow-y-auto animate-fade-up">
        {/* Header */}
        <div className="sticky top-0 bg-s0 z-10 flex items-center justify-between px-5 py-4 border-b border-edge/35">
          <div>
            <h2 className="text-base font-semibold text-bright">Place Order</h2>
            <p className="text-xs text-ghost mt-0.5">FHIR ServiceRequest via CDS Hooks</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-ghost hover:text-bright hover:bg-s1 transition-colors"
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Order details */}
          <div className="space-y-3">
            <h3 className="text-xs font-ui font-semibold uppercase tracking-wider text-ghost">Order Details</h3>
            <div className="surface p-4 space-y-2">
              <div className="flex items-center gap-2">
                <ItemTypeBadge type={order.item_type} />
                <span className="text-sm font-medium text-bright">{order.item_name}</span>
              </div>
              <p className="text-xs text-dim">{measure.measure_name}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {order.loinc_code && (
                  <span className="font-data text-[10px] text-ghost tabular-nums bg-s1 px-1.5 py-0.5 rounded border border-edge/20">
                    LOINC {order.loinc_code}
                  </span>
                )}
                {order.cpt_code && (
                  <span className="font-data text-[10px] text-ghost tabular-nums bg-s1 px-1.5 py-0.5 rounded border border-edge/20">
                    CPT {order.cpt_code}
                  </span>
                )}
                {order.frequency && (
                  <span className="font-data text-[10px] text-ghost tabular-nums bg-s1 px-1.5 py-0.5 rounded border border-edge/20">
                    {order.frequency}
                  </span>
                )}
              </div>
              {order.guideline_source && (
                <p className="text-[10px] text-ghost mt-1">Guideline: {order.guideline_source}</p>
              )}
            </div>
          </div>

          {/* Patient info */}
          <div className="space-y-2">
            <h3 className="text-xs font-ui font-semibold uppercase tracking-wider text-ghost">Patient</h3>
            <p className="text-sm text-dim">{patientName} (ID: {patientId})</p>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <h3 className="text-xs font-ui font-semibold uppercase tracking-wider text-ghost">Priority</h3>
            <div className="flex gap-2">
              {(['routine', 'urgent', 'stat'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={[
                    'px-3 py-1.5 rounded-btn text-xs font-ui capitalize border transition-colors',
                    priority === p
                      ? p === 'stat' ? 'bg-crimson/15 text-crimson border-crimson/40'
                        : p === 'urgent' ? 'bg-amber/15 text-amber border-amber/40'
                        : 'bg-teal/15 text-teal border-teal/40'
                      : 'bg-transparent text-ghost border-edge/30 hover:text-dim hover:bg-s1',
                  ].join(' ')}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-2">
            <h3 className="text-xs font-ui font-semibold uppercase tracking-wider text-ghost">Instructions (Optional)</h3>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Additional instructions for the order..."
              rows={2}
              className="input-field w-full text-xs resize-none"
            />
          </div>

          {/* FHIR preview */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileCode2 size={12} className="text-ghost" strokeWidth={1.5} />
              <h3 className="text-xs font-ui font-semibold uppercase tracking-wider text-ghost">FHIR ServiceRequest Preview</h3>
            </div>
            <pre className="bg-s1 border border-edge/25 rounded-card p-3 text-[10px] font-data text-dim overflow-x-auto max-h-48 overflow-y-auto">
              {JSON.stringify(fhirPreview, null, 2)}
            </pre>
          </div>

          {/* Submit */}
          <button
            onClick={() => onConfirm(priority, instructions)}
            disabled={isPlacing}
            className={[
              'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-btn text-sm font-ui font-medium',
              'bg-teal text-black',
              'hover:bg-teal/90 transition-colors duration-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50',
              isPlacing ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <Send size={14} strokeWidth={2} />
            {isPlacing ? 'Placing Order...' : 'Confirm & Place Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BatchOrderModal ─────────────────────────────────────────────────────────

function BatchOrderModal({
  patient,
  priority,
  onPriorityChange,
  onClose,
  onConfirm,
  isPlacing,
}: {
  patient: WorklistPatient;
  priority: 'routine' | 'urgent' | 'stat';
  onPriorityChange: (p: 'routine' | 'urgent' | 'stat') => void;
  onClose: () => void;
  onConfirm: () => void;
  isPlacing: boolean;
}) {
  // Collect all actionable orders
  const actionable: { bundle: string; measure: string; order: OrderItem }[] = [];
  for (const bundle of patient.bundles) {
    for (const measure of bundle.measures) {
      if (measure.gap_status !== 'in_progress' && measure.orders.length > 0) {
        actionable.push({
          bundle: bundle.condition_name,
          measure: measure.measure_name,
          order: measure.orders[0],
        });
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-xl bg-s0 border border-edge/40 shadow-2xl rounded-card overflow-hidden animate-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-edge/35">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-card bg-violet/10">
              <Zap size={15} className="text-violet" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-bright">Order All for {patient.patient_name}</h2>
              <p className="text-xs text-ghost mt-0.5">
                Place {actionable.length} order{actionable.length !== 1 ? 's' : ''} in a single batch
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-ghost hover:text-bright hover:bg-s1 transition-colors"
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Orders list */}
        <div className="max-h-[320px] overflow-y-auto px-5 py-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ghost font-ui uppercase tracking-wider text-[10px]">
                <th className="pb-2 pr-3">Order</th>
                <th className="pb-2 pr-3">Bundle</th>
                <th className="pb-2 pr-3">Type</th>
                <th className="pb-2">Code</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/15">
              {actionable.map((a, i) => (
                <tr key={i} className="text-dim">
                  <td className="py-1.5 pr-3">
                    <span className="text-bright font-medium">{a.order.item_name}</span>
                    <span className="block text-[10px] text-ghost">{a.measure}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-ghost">{a.bundle}</td>
                  <td className="py-1.5 pr-3"><ItemTypeBadge type={a.order.item_type} /></td>
                  <td className="py-1.5 font-data text-ghost tabular-nums whitespace-nowrap">
                    {a.order.loinc_code ? `LOINC ${a.order.loinc_code}` : a.order.cpt_code ? `CPT ${a.order.cpt_code}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer: priority + confirm */}
        <div className="px-5 py-4 border-t border-edge/35 space-y-3">
          {/* Priority selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-ui font-semibold uppercase tracking-wider text-ghost">Priority:</span>
            <div className="flex gap-2">
              {(['routine', 'urgent', 'stat'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => onPriorityChange(p)}
                  className={[
                    'px-3 py-1 rounded-btn text-xs font-ui capitalize border transition-colors',
                    priority === p
                      ? p === 'stat' ? 'bg-crimson/15 text-crimson border-crimson/40'
                        : p === 'urgent' ? 'bg-amber/15 text-amber border-amber/40'
                        : 'bg-teal/15 text-teal border-teal/40'
                      : 'bg-transparent text-ghost border-edge/30 hover:text-dim hover:bg-s1',
                  ].join(' ')}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Confirm button */}
          <button
            onClick={onConfirm}
            disabled={isPlacing}
            className={[
              'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-btn text-sm font-ui font-medium',
              'bg-violet text-white',
              'hover:bg-violet/90 transition-colors duration-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/50',
              isPlacing ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          >
            {isPlacing ? (
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} strokeWidth={2} />
            )}
            {isPlacing
              ? `Placing ${actionable.length} Orders...`
              : `Confirm & Place ${actionable.length} Order${actionable.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CareListsPage ───────────────────────────────────────────────────────────

export function CareListsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [orderTarget, setOrderTarget] = useState<{
    order: OrderItem;
    measure: WorklistMeasure;
    patientId: number;
    patientName: string;
  } | null>(null);

  const [batchTarget, setBatchTarget] = useState<WorklistPatient | null>(null);
  const [batchPriority, setBatchPriority] = useState<'routine' | 'urgent' | 'stat'>('routine');

  const toast = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const { data, isLoading } = useOrderWorklist({
    search: debouncedSearch || undefined,
    page,
    per_page: perPage,
  });

  const placeOrder = usePlaceOrder();
  const placeOrderBatch = usePlaceOrderBatch();

  const patients: WorklistPatient[] = (data as { data?: WorklistPatient[] })?.data ?? [];
  const meta = (data as { meta?: { total?: number; total_pages?: number; page?: number } })?.meta;

  const totalGaps = patients.reduce((s, p) => s + p.total_open_gaps, 0);
  const totalActionable = patients.reduce((s, p) => s + p.actionable_orders, 0);
  const totalPages = meta?.total_pages ?? 1;

  function handlePlaceOrder(order: OrderItem, measure: WorklistMeasure, patientId: number) {
    const patient = patients.find((p) => p.patient_id === patientId);
    setOrderTarget({
      order,
      measure,
      patientId,
      patientName: patient?.patient_name ?? `Patient ${patientId}`,
    });
  }

  function handleConfirmOrder(priority: string, instructions: string) {
    if (!orderTarget) return;
    placeOrder.mutate(
      {
        patient_id: orderTarget.patientId,
        care_gap_id: orderTarget.measure.care_gap_id,
        order_set_item_id: orderTarget.order.item_id,
        priority: priority as 'stat' | 'urgent' | 'routine',
        instructions: instructions || undefined,
      },
      {
        onSuccess: (result) => {
          const orderData = (result as { data?: { order?: { order_name?: string; loinc_code?: string } } })?.data?.order;
          const loincStr = orderData?.loinc_code ? ` (LOINC ${orderData.loinc_code})` : '';
          toast.success(`Order placed: ${orderData?.order_name ?? orderTarget.order.item_name}${loincStr}`);
          setOrderTarget(null);
        },
        onError: () => {
          toast.error('Failed to place order');
        },
      },
    );
  }

  function handleOrderAll(patient: WorklistPatient) {
    setBatchTarget(patient);
    setBatchPriority('routine');
  }

  function handleConfirmBatch() {
    if (!batchTarget) return;

    // Collect all actionable orders: open gaps with at least one order
    const batchOrders: { care_gap_id: number; order_set_item_id: number }[] = [];
    for (const bundle of batchTarget.bundles) {
      for (const measure of bundle.measures) {
        if (measure.gap_status !== 'in_progress' && measure.orders.length > 0) {
          batchOrders.push({
            care_gap_id: measure.care_gap_id,
            order_set_item_id: measure.orders[0].item_id,
          });
        }
      }
    }

    if (batchOrders.length === 0) return;

    placeOrderBatch.mutate(
      {
        patient_id: batchTarget.patient_id,
        priority: batchPriority,
        orders: batchOrders,
      },
      {
        onSuccess: (result) => {
          const count = (result as { data?: { order_count?: number } })?.data?.order_count ?? batchOrders.length;
          toast.success(`${count} order${count !== 1 ? 's' : ''} placed for ${batchTarget.patient_name}`);
          setBatchTarget(null);
        },
        onError: () => {
          toast.error('Failed to place batch orders');
        },
      },
    );
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-bright">Care Lists</h1>
        <p className="text-sm text-dim mt-0.5">
          Bundle-grouped care gaps with CDS Hooks order placement
        </p>
      </div>

      {/* Stats strip */}
      <div className="surface animate-fade-up stagger-1 p-0 overflow-hidden">
        <div className="flex items-stretch divide-x divide-edge/25">
          <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card bg-amber/10">
              <AlertCircle size={15} className="text-amber" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-data text-data-lg text-amber tabular-nums leading-none">
                {isLoading ? '—' : totalGaps.toLocaleString()}
              </p>
              <p className="data-label mt-0.5">Open Gaps</p>
            </div>
          </div>

          <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card bg-teal/10">
              <ShoppingCart size={15} className="text-teal" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-data text-data-lg text-teal tabular-nums leading-none">
                {isLoading ? '—' : totalActionable.toLocaleString()}
              </p>
              <p className="data-label mt-0.5">Actionable Orders</p>
            </div>
          </div>

          <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card bg-violet/10">
              <Users size={15} className="text-violet" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-data text-data-lg text-bright tabular-nums leading-none">
                {isLoading ? '—' : (meta?.total ?? 0).toLocaleString()}
              </p>
              <p className="data-label mt-0.5">Patients</p>
            </div>
          </div>

          <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card bg-emerald/10">
              <ListChecks size={15} className="text-emerald" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-data text-data-lg text-emerald tabular-nums leading-none">
                {isLoading ? '—' : patients.reduce((s, p) => s + p.bundles.length, 0).toLocaleString()}
              </p>
              <p className="data-label mt-0.5">Active Bundles</p>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 animate-fade-up stagger-2">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={14}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ghost pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search patients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9 w-full"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search patients"
          />
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs text-ghost">
          <FileCode2 size={12} strokeWidth={1.5} />
          <span>CDS Hooks: order-sign</span>
        </div>
      </div>

      {/* Worklist */}
      <div className="surface p-0 overflow-hidden animate-fade-up stagger-3">
        {/* Loading skeletons */}
        {isLoading && (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-4 border-b border-edge/15">
                <div className="skeleton w-4 h-4 rounded flex-shrink-0" />
                <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3 w-40 rounded" />
                  <div className="skeleton h-2.5 w-56 rounded" />
                </div>
                <div className="skeleton h-5 w-20 rounded-pill" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && patients.length === 0 && (
          <div className="empty-state py-16">
            <p className="empty-state-title">No open care gaps found</p>
            {debouncedSearch ? (
              <p className="empty-state-desc">
                No results for <span className="text-bright font-medium">"{debouncedSearch}"</span>
              </p>
            ) : (
              <p className="empty-state-desc text-emerald">
                All care gaps are resolved — excellent work!
              </p>
            )}
          </div>
        )}

        {/* Patient groups */}
        {!isLoading && patients.length > 0 && (
          <div>
            {patients.map((patient, idx) => (
              <PatientBundleGroup
                key={patient.patient_id}
                patient={patient}
                onPlaceOrder={handlePlaceOrder}
                onOrderAll={handleOrderAll}
                isOrderingAll={placeOrderBatch.isPending && batchTarget?.patient_id === patient.patient_id}
                defaultOpen={idx === 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="animate-fade-up stagger-4">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={meta?.total}
            perPage={perPage}
            itemLabel="patients"
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Order Panel (slide-over) — single order */}
      {orderTarget && (
        <OrderPanel
          order={orderTarget.order}
          measure={orderTarget.measure}
          patientId={orderTarget.patientId}
          patientName={orderTarget.patientName}
          onClose={() => setOrderTarget(null)}
          onConfirm={handleConfirmOrder}
          isPlacing={placeOrder.isPending}
        />
      )}

      {/* Batch Order Confirmation Modal — "Order All" */}
      {batchTarget && (
        <BatchOrderModal
          patient={batchTarget}
          priority={batchPriority}
          onPriorityChange={setBatchPriority}
          onClose={() => setBatchTarget(null)}
          onConfirm={handleConfirmBatch}
          isPlacing={placeOrderBatch.isPending}
        />
      )}
    </div>
  );
}
