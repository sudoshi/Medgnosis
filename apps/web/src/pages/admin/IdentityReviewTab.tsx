// =============================================================================
// Admin — Identity Review Tab (EMPI steward queue)
//
// Lists open identity_review_queue items. For each, shows the persons involved
// side by side; the steward picks a survivor and Merges the others into it, or
// Dismisses the review as not-a-match.
// =============================================================================

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitMerge, X, Users, ShieldQuestion } from 'lucide-react';
import { useToast } from '../../stores/ui.js';
import { api, apiErrorMessage } from '../../services/api.js';
import { fmtDate } from './helpers.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface IdentityReviewPerson {
  personId: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: string | null;
  status: string;
  linkedPatientCount: number;
  identifiers: Array<{ system: string; value: string; sourceSystem: string | null }>;
}

export interface IdentityReview {
  id: number;
  reason: string;
  sourceSystem: string | null;
  demographicKey: string | null;
  createdAt: string;
  persons: IdentityReviewPerson[];
}

const REASON_LABEL: Record<string, string> = {
  demographic_only_match: 'Demographic match',
  identifier_conflict: 'Identifier conflict',
};

export function IdentityReviewTab() {
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'identity', 'reviews'],
    queryFn: () => api.get<{ reviews: IdentityReview[] }>('/admin/identity/reviews'),
    staleTime: 15_000,
  });
  const reviews = data?.data?.reviews ?? [];

  const merge = useMutation({
    mutationFn: (vars: { reviewId: number; survivorPersonId: number }) =>
      api.post(`/admin/identity/reviews/${vars.reviewId}/merge`, { survivorPersonId: vars.survivorPersonId }),
    onSuccess: () => {
      toast.success('Persons merged');
      qc.invalidateQueries({ queryKey: ['admin', 'identity', 'reviews'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Merge failed')),
  });

  const dismiss = useMutation({
    mutationFn: (reviewId: number) => api.post(`/admin/identity/reviews/${reviewId}/dismiss`),
    onSuccess: () => {
      toast.success('Review dismissed');
      qc.invalidateQueries({ queryKey: ['admin', 'identity', 'reviews'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Dismiss failed')),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Identity Review</h2>
          <p className="text-sm text-muted-foreground">
            Possible-match and identifier-conflict cases awaiting steward adjudication.
          </p>
        </div>
        <Badge variant="dim">{reviews.length} open</Badge>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && reviews.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-10 text-center">
          <ShieldQuestion className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No open reviews</p>
          <p className="text-sm text-muted-foreground">Identity resolution has nothing pending adjudication.</p>
        </div>
      )}

      <div className="space-y-4">
        {reviews.map((review) => (
          <ReviewCard
            key={review.id}
            review={review}
            busy={merge.isPending || dismiss.isPending}
            onMerge={(survivorPersonId) => merge.mutate({ reviewId: review.id, survivorPersonId })}
            onDismiss={() => dismiss.mutate(review.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({
  review,
  busy,
  onMerge,
  onDismiss,
}: {
  review: IdentityReview;
  busy: boolean;
  onMerge: (survivorPersonId: number) => void;
  onDismiss: () => void;
}) {
  const [survivor, setSurvivor] = useState<number | null>(review.persons[0]?.personId ?? null);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge>{REASON_LABEL[review.reason] ?? review.reason}</Badge>
          {review.sourceSystem && <span className="text-xs text-muted-foreground">via {review.sourceSystem}</span>}
        </div>
        <span className="text-xs text-muted-foreground">{fmtDate(review.createdAt)}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {review.persons.map((person) => (
          <PersonCard
            key={person.personId}
            person={person}
            selected={survivor === person.personId}
            onSelect={() => setSurvivor(person.personId)}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onDismiss}>
          <X className="mr-1 h-4 w-4" /> Not a match
        </Button>
        <Button
          size="sm"
          disabled={busy || survivor === null || review.persons.length < 2}
          onClick={() => survivor !== null && onMerge(survivor)}
        >
          <GitMerge className="mr-1 h-4 w-4" /> Merge into selected
        </Button>
      </div>
    </div>
  );
}

function PersonCard({
  person,
  selected,
  onSelect,
}: {
  person: IdentityReviewPerson;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col gap-2 rounded-md border p-3 text-left transition ${
        selected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-muted-foreground'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {person.lastName}, {person.firstName}
        </span>
        {selected && <Badge variant="teal">survivor</Badge>}
      </div>
      <div className="text-xs text-muted-foreground">
        DOB {person.dateOfBirth}{person.sex ? ` · ${person.sex}` : ''} · person #{person.personId}
        {person.status !== 'active' ? ` · ${person.status}` : ''}
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Users className="h-3 w-3" /> {person.linkedPatientCount} linked record{person.linkedPatientCount === 1 ? '' : 's'}
      </div>
      {person.identifiers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {person.identifiers.slice(0, 4).map((id) => (
            <span key={`${id.system}|${id.value}`} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {id.value}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
