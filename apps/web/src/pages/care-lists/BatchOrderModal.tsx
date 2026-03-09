// =============================================================================
// Care Lists — BatchOrderModal ("Order All" confirmation)
// =============================================================================

import {
  X,
  Zap,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { ItemTypeBadge } from './helpers.js';
import type { OrderItem, WorklistPatient } from './types.js';

interface BatchOrderModalProps {
  patient: WorklistPatient;
  priority: 'routine' | 'urgent' | 'stat';
  onPriorityChange: (p: 'routine' | 'urgent' | 'stat') => void;
  onClose: () => void;
  onConfirm: () => void;
  isPlacing: boolean;
}

export function BatchOrderModal({
  patient,
  priority,
  onPriorityChange,
  onClose,
  onConfirm,
  isPlacing,
}: BatchOrderModalProps) {
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
                    {a.order.loinc_code ? `LOINC ${a.order.loinc_code}` : a.order.cpt_code ? `CPT ${a.order.cpt_code}` : '\u2014'}
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
