// =============================================================================
// Care Lists — Stats Strip
// =============================================================================

import {
  AlertCircle,
  ShoppingCart,
  Users,
  ListChecks,
} from 'lucide-react';
import type { WorklistPatient } from './types.js';

interface CareListsStatsStripProps {
  isLoading: boolean;
  patients: WorklistPatient[];
  totalGaps: number;
  totalActionable: number;
  totalPatients: number;
}

export function CareListsStatsStrip({
  isLoading,
  patients,
  totalGaps,
  totalActionable,
  totalPatients,
}: CareListsStatsStripProps) {
  return (
    <div className="surface animate-fade-up stagger-1 p-0 overflow-hidden">
      <div className="flex items-stretch divide-x divide-edge/25">
        <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
          <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card bg-amber/10">
            <AlertCircle size={15} className="text-amber" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-data text-data-lg text-amber tabular-nums leading-none">
              {isLoading ? '\u2014' : totalGaps.toLocaleString()}
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
              {isLoading ? '\u2014' : totalActionable.toLocaleString()}
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
              {isLoading ? '\u2014' : totalPatients.toLocaleString()}
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
              {isLoading ? '\u2014' : patients.reduce((s, p) => s + p.bundles.length, 0).toLocaleString()}
            </p>
            <p className="data-label mt-0.5">Active Bundles</p>
          </div>
        </div>
      </div>
    </div>
  );
}
