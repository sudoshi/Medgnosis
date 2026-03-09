// =============================================================================
// Medgnosis Web — Care Lists  (Tier 6: CDS Hooks Order Placement)
// Bundle-grouped care gap worklist with FHIR order placement
// =============================================================================

import { useState, useRef, useEffect } from 'react';
import {
  Search,
  FileCode2,
} from 'lucide-react';
import { useOrderWorklist, usePlaceOrder, usePlaceOrderBatch } from '../hooks/useApi.js';
import { Pagination } from '../components/Pagination.js';
import { useToast } from '../stores/ui.js';
import type { OrderItem, WorklistMeasure, WorklistPatient } from './care-lists/types.js';
import { CareListsStatsStrip } from './care-lists/StatsStrip.js';
import { PatientBundleGroup } from './care-lists/PatientBundleGroup.js';
import { OrderPanel } from './care-lists/OrderPanel.js';
import { BatchOrderModal } from './care-lists/BatchOrderModal.js';

// ─── CareListsPage ──────────────────────────────────────────────────────────

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
      <CareListsStatsStrip
        isLoading={isLoading}
        patients={patients}
        totalGaps={totalGaps}
        totalActionable={totalActionable}
        totalPatients={meta?.total ?? 0}
      />

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
