import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataBoundary } from './DataBoundary.js';

describe('DataBoundary', () => {
  const loading = <div>LOADING</div>;
  const empty = <div>EMPTY</div>;
  const data = <div>DATA</div>;

  it('renders loading when isLoading', () => {
    render(
      <DataBoundary isLoading loading={loading} empty={empty}>
        {data}
      </DataBoundary>,
    );
    expect(screen.getByText('LOADING')).toBeInTheDocument();
    expect(screen.queryByText('DATA')).not.toBeInTheDocument();
  });

  it('renders the error state on isError — and NOT the empty state (safety guarantee)', () => {
    render(
      <DataBoundary isLoading={false} isError isEmpty what="the worklist" loading={loading} empty={empty}>
        {data}
      </DataBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t load the worklist/i);
    expect(screen.queryByText('EMPTY')).not.toBeInTheDocument();
    expect(screen.queryByText('DATA')).not.toBeInTheDocument();
  });

  it('renders a retry button when onRetry is provided', () => {
    let retried = 0;
    render(
      <DataBoundary isLoading={false} isError loading={loading} onRetry={() => (retried += 1)}>
        {data}
      </DataBoundary>,
    );
    const btn = screen.getByRole('button', { name: /retry/i });
    btn.click();
    expect(retried).toBe(1);
  });

  it('renders empty when loaded with no data', () => {
    render(
      <DataBoundary isLoading={false} isEmpty loading={loading} empty={empty}>
        {data}
      </DataBoundary>,
    );
    expect(screen.getByText('EMPTY')).toBeInTheDocument();
    expect(screen.queryByText('DATA')).not.toBeInTheDocument();
  });

  it('renders children when data is present', () => {
    render(
      <DataBoundary isLoading={false} loading={loading} empty={empty}>
        {data}
      </DataBoundary>,
    );
    expect(screen.getByText('DATA')).toBeInTheDocument();
  });

  it('prioritizes loading over error and empty', () => {
    render(
      <DataBoundary isLoading isError isEmpty loading={loading} empty={empty}>
        {data}
      </DataBoundary>,
    );
    expect(screen.getByText('LOADING')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
