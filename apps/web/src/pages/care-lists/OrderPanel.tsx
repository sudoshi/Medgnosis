// =============================================================================
// Care Lists — OrderPanel (Slide-over for single order placement)
// =============================================================================

import { useState } from 'react';
import {
  X,
  Send,
  FileCode2,
} from 'lucide-react';
import { ItemTypeBadge } from './helpers.js';
import type { OrderItem, WorklistMeasure } from './types.js';

interface OrderPanelProps {
  order: OrderItem;
  measure: WorklistMeasure;
  patientId: number;
  patientName: string;
  onClose: () => void;
  onConfirm: (priority: string, instructions: string) => void;
  isPlacing: boolean;
}

export function OrderPanel({
  order,
  measure,
  patientId,
  patientName,
  onClose,
  onConfirm,
  isPlacing,
}: OrderPanelProps) {
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
              'bg-teal text-accent-fg',
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
