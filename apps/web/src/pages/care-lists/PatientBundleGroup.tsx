// =============================================================================
// Care Lists — PatientBundleGroup, BundleSection, MeasureRow
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  Send,
  Zap,
  Loader2,
} from 'lucide-react';
import { PatientAvatar, getInitials } from '../../components/PatientAvatar.js';
import { ItemTypeBadge, PriorityDot } from './helpers.js';
import type { OrderItem, WorklistMeasure, WorklistBundle, WorklistPatient } from './types.js';

// ─── MeasureRow ──────────────────────────────────────────────────────────────

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

// ─── BundleSection ───────────────────────────────────────────────────────────

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

// ─── PatientBundleGroup ──────────────────────────────────────────────────────

interface PatientBundleGroupProps {
  patient: WorklistPatient;
  onPlaceOrder: (order: OrderItem, measure: WorklistMeasure, patientId: number) => void;
  onOrderAll: (patient: WorklistPatient) => void;
  isOrderingAll: boolean;
  defaultOpen?: boolean;
}

export function PatientBundleGroup({
  patient,
  onPlaceOrder,
  onOrderAll,
  isOrderingAll,
  defaultOpen = false,
}: PatientBundleGroupProps) {
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
