import { request } from 'undici';
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { BenchmarkResult, BenchmarkSuite } from './types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MODE: 'baseline' | 'solr' = (() => {
  const flag = process.argv.find((a) => a.startsWith('--mode='));
  const value = flag?.split('=')[1];
  if (value === 'solr') return 'solr';
  return 'baseline';
})();

const API_BASE = process.env.API_BASE ?? 'http://localhost:3002/api/v1';
const BENCH_SAMPLES = Number(process.env.BENCH_SAMPLES) || 20;
const WARMUP = 3;

const RESULTS_DIR = resolve(import.meta.dirname ?? __dirname, '../../benchmark-results');

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

let authToken = '';

async function apiRequest(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; json: unknown }> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (authToken) {
    headers['authorization'] = `Bearer ${authToken}`;
  }

  const { statusCode, body: resBody } = await request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await resBody.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: statusCode, json };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function authenticate(): Promise<void> {
  console.log('Authenticating as dr.udoshi@medgnosis.app ...');
  const { status, json } = await apiRequest('POST', '/auth/login', {
    email: 'dr.udoshi@medgnosis.app',
    password: 'password',
  });

  if (status !== 200) {
    console.error('Auth failed:', status, json);
    process.exit(1);
  }

  const payload = json as Record<string, unknown>;
  authToken = (
    payload.token ??
    payload.accessToken ??
    (payload as any).data?.tokens?.access_token ??
    (payload as any).data?.token
  ) as string;

  if (!authToken) {
    console.error('Could not extract token from auth response:', payload);
    process.exit(1);
  }
  console.log('Authenticated successfully.\n');
}

// ---------------------------------------------------------------------------
// Discover a real patient ID
// ---------------------------------------------------------------------------

async function discoverPatientId(): Promise<string | null> {
  const { status, json } = await apiRequest('GET', '/patients?page=1&per_page=1');
  if (status !== 200) return null;

  const payload = json as Record<string, unknown>;
  const data = (payload.data ?? payload.patients ?? payload.results) as
    | Array<Record<string, unknown>>
    | undefined;

  if (!data || data.length === 0) return null;

  const first = data[0];
  const id = first.id ?? first.patient_id ?? first.patientId;
  return id != null ? String(id) : null;
}

// ---------------------------------------------------------------------------
// Percentile helper
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ---------------------------------------------------------------------------
// Benchmark a single endpoint
// ---------------------------------------------------------------------------

interface EndpointSpec {
  name: string;
  method: 'GET' | 'POST';
  path: string;
}

async function benchmarkEndpoint(spec: EndpointSpec): Promise<BenchmarkResult> {
  const { name, method, path } = spec;
  process.stdout.write(`  ${name} ... `);

  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    await apiRequest(method, path);
  }

  // Timed runs
  const latencies: number[] = [];
  for (let i = 0; i < BENCH_SAMPLES; i++) {
    const t0 = performance.now();
    await apiRequest(method, path);
    const t1 = performance.now();
    latencies.push(t1 - t0);
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const mean = latencies.reduce((s, v) => s + v, 0) / latencies.length;

  const result: BenchmarkResult = {
    endpoint: name,
    method,
    source: MODE === 'solr' ? 'solr' : 'pg',
    samples: BENCH_SAMPLES,
    p50Ms: round(percentile(sorted, 50)),
    p95Ms: round(percentile(sorted, 95)),
    p99Ms: round(percentile(sorted, 99)),
    meanMs: round(mean),
    minMs: round(sorted[0]),
    maxMs: round(sorted[sorted.length - 1]),
  };

  console.log(`p50=${result.p50Ms}ms  p95=${result.p95Ms}ms  mean=${result.meanMs}ms`);
  return result;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Table printing
// ---------------------------------------------------------------------------

function printResultsTable(results: BenchmarkResult[]): void {
  const header = ['Endpoint', 'Method', 'Source', 'Samples', 'p50', 'p95', 'p99', 'Mean', 'Min', 'Max'];
  const rows = results.map((r) => [
    r.endpoint,
    r.method,
    r.source,
    String(r.samples),
    `${r.p50Ms}ms`,
    `${r.p95Ms}ms`,
    `${r.p99Ms}ms`,
    `${r.meanMs}ms`,
    `${r.minMs}ms`,
    `${r.maxMs}ms`,
  ]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );

  const pad = (s: string, w: number) => s.padEnd(w);
  const line = widths.map((w) => '-'.repeat(w)).join('-+-');

  console.log('\n' + header.map((h, i) => pad(h, widths[i])).join(' | '));
  console.log(line);
  for (const row of rows) {
    console.log(row.map((c, i) => pad(c, widths[i])).join(' | '));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Comparison table
// ---------------------------------------------------------------------------

function loadLatestBaseline(): BenchmarkSuite | null {
  try {
    const files = readdirSync(RESULTS_DIR)
      .filter((f) => f.startsWith('baseline-') && f.endsWith('.json'))
      .sort();
    if (files.length === 0) return null;
    const latest = files[files.length - 1];
    const raw = readFileSync(join(RESULTS_DIR, latest), 'utf-8');
    return JSON.parse(raw) as BenchmarkSuite;
  } catch {
    return null;
  }
}

function printComparisonTable(baseline: BenchmarkSuite, current: BenchmarkSuite): void {
  console.log('=== Comparison: Baseline vs Solr ===\n');

  const header = ['Endpoint', 'Metric', 'Baseline', 'Solr', 'Speedup'];
  const rows: string[][] = [];

  for (const solrResult of current.results) {
    const baseResult = baseline.results.find((b) => b.endpoint === solrResult.endpoint);
    if (!baseResult) continue;

    const metrics: Array<{ label: string; baseVal: number; solrVal: number }> = [
      { label: 'p50', baseVal: baseResult.p50Ms, solrVal: solrResult.p50Ms },
      { label: 'p95', baseVal: baseResult.p95Ms, solrVal: solrResult.p95Ms },
      { label: 'mean', baseVal: baseResult.meanMs, solrVal: solrResult.meanMs },
    ];

    for (const m of metrics) {
      const speedup = m.solrVal > 0 ? m.baseVal / m.solrVal : Infinity;
      rows.push([
        solrResult.endpoint,
        m.label,
        `${m.baseVal}ms`,
        `${m.solrVal}ms`,
        `${round(speedup)}x`,
      ]);
    }
  }

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );

  const pad = (s: string, w: number) => s.padEnd(w);
  const line = widths.map((w) => '-'.repeat(w)).join('-+-');

  console.log(header.map((h, i) => pad(h, widths[i])).join(' | '));
  console.log(line);
  for (const row of rows) {
    console.log(row.map((c, i) => pad(c, widths[i])).join(' | '));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`\nBenchmark Runner — mode: ${MODE}, samples: ${BENCH_SAMPLES}, warmup: ${WARMUP}`);
  console.log(`API: ${API_BASE}\n`);

  mkdirSync(RESULTS_DIR, { recursive: true });

  await authenticate();

  // Discover a real patient ID
  const patientId = await discoverPatientId();
  if (patientId) {
    console.log(`Discovered patient ID: ${patientId}\n`);
  } else {
    console.log('Could not discover a patient ID; skipping patient-specific endpoints.\n');
  }

  // Define endpoints
  const endpoints: EndpointSpec[] = [
    { name: 'Global search', method: 'GET', path: '/search?q=john&limit=20' },
    { name: 'Patient list search', method: 'GET', path: '/patients?search=smith&page=1&per_page=25' },
    { name: 'Care gaps search', method: 'GET', path: '/care-gaps?search=diabetes&status=open&page=1&per_page=25' },
    { name: 'Dashboard', method: 'GET', path: '/dashboard' },
  ];

  if (patientId) {
    endpoints.push(
      { name: 'Patient conditions', method: 'GET', path: `/patients/${patientId}/conditions` },
      { name: 'Patient encounters', method: 'GET', path: `/patients/${patientId}/encounters` },
    );
  }

  // Run benchmarks
  console.log('Running benchmarks...\n');
  const results: BenchmarkResult[] = [];
  for (const spec of endpoints) {
    const result = await benchmarkEndpoint(spec);
    results.push(result);
  }

  // Print results table
  printResultsTable(results);

  // Save to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suite: BenchmarkSuite = {
    timestamp: new Date().toISOString(),
    mode: MODE,
    results,
  };

  const filename = `${MODE}-${timestamp}.json`;
  const filepath = join(RESULTS_DIR, filename);
  writeFileSync(filepath, JSON.stringify(suite, null, 2));
  console.log(`Results saved to ${filepath}`);

  // Comparison if solr mode
  if (MODE === 'solr') {
    const baseline = loadLatestBaseline();
    if (baseline) {
      console.log();
      printComparisonTable(baseline, suite);
    } else {
      console.log('\nNo baseline results found. Run with --mode=baseline first for comparison.');
    }
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
