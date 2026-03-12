export interface BenchmarkResult {
  endpoint: string;
  method: string;
  source: 'pg' | 'solr';
  samples: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
}

export interface BenchmarkSuite {
  timestamp: string;
  mode: 'baseline' | 'solr';
  results: BenchmarkResult[];
}
