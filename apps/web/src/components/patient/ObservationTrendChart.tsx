// =============================================================================
// Medgnosis — Observation Trend Chart (Module 10.5)
// Recharts line chart with reference range lines for a specific observation
// =============================================================================

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { useObservationTrending } from '../../hooks/useApi.js';
import { X, TrendingUp } from 'lucide-react';

interface ObservationTrendChartProps {
  patientId: string;
  code: string;
  label: string;
  onClose: () => void;
}

function formatChartDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function parseReferenceRange(range: string | null): { low: number | null; high: number | null } {
  if (!range) return { low: null, high: null };
  // Common formats: "70-100", "< 200", "> 40", "3.5-5.0"
  const dashMatch = range.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
  if (dashMatch) {
    return { low: parseFloat(dashMatch[1]), high: parseFloat(dashMatch[2]) };
  }
  const ltMatch = range.match(/<\s*([\d.]+)/);
  if (ltMatch) {
    return { low: null, high: parseFloat(ltMatch[1]) };
  }
  const gtMatch = range.match(/>\s*([\d.]+)/);
  if (gtMatch) {
    return { low: parseFloat(gtMatch[1]), high: null };
  }
  return { low: null, high: null };
}

interface TrendingDataPoint {
  date: string;
  value: number;
  unit: string | null;
  reference_range: string | null;
  abnormal_flag: string | null;
}

export function ObservationTrendChart({ patientId, code, label, onClose }: ObservationTrendChartProps) {
  const { data, isLoading } = useObservationTrending(patientId, code);

  const points = (data?.data ?? []) as TrendingDataPoint[];

  if (isLoading) {
    return (
      <div className="surface">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-teal" />
            <span className="text-sm font-semibold text-bright">{label}</span>
          </div>
          <button onClick={onClose} className="p-1 text-ghost hover:text-dim transition-colors rounded">
            <X size={14} />
          </button>
        </div>
        <div className="skeleton h-48 rounded-card" />
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="surface">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-teal" />
            <span className="text-sm font-semibold text-bright">{label}</span>
          </div>
          <button onClick={onClose} className="p-1 text-ghost hover:text-dim transition-colors rounded">
            <X size={14} />
          </button>
        </div>
        <p className="text-xs text-ghost text-center py-8">No numeric data available for trending.</p>
      </div>
    );
  }

  // Parse reference range from first point
  const refRange = parseReferenceRange(points[0]?.reference_range);
  const unit = points[0]?.unit || '';

  // Prepare chart data
  const chartData = points.map((pt) => ({
    date: formatChartDate(pt.date),
    value: pt.value,
    abnormal: pt.abnormal_flag === 'Y',
  }));

  // Calculate Y-axis domain with padding
  const values = points.map((p) => p.value);
  const allValues = [...values];
  if (refRange.low !== null) allValues.push(refRange.low);
  if (refRange.high !== null) allValues.push(refRange.high);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const padding = (maxVal - minVal) * 0.15 || 5;

  return (
    <div className="surface animate-fade-up">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-teal" />
          <span className="text-sm font-semibold text-bright">{label}</span>
          {unit && <span className="font-data text-xs text-ghost">({unit})</span>}
          <span className="font-data text-xs text-ghost tabular-nums">{points.length} readings</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-ghost hover:text-dim hover:bg-s2 transition-colors rounded-card"
        >
          <X size={14} />
        </button>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(30, 68, 120, 0.3)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#5E7FA3' }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(30, 68, 120, 0.3)' }}
          />
          <YAxis
            domain={[minVal - padding, maxVal + padding]}
            tick={{ fontSize: 10, fill: '#5E7FA3' }}
            tickLine={false}
            axisLine={false}
            width={45}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#111B2E',
              border: '1px solid rgba(30, 68, 120, 0.5)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#EDF2FF',
            }}
            labelStyle={{ color: '#5E7FA3', fontSize: '11px' }}
            formatter={(value: number) => [`${value} ${unit}`, label]}
          />

          {/* Reference range lines */}
          {refRange.low !== null && (
            <ReferenceLine
              y={refRange.low}
              stroke="#F5A623"
              strokeDasharray="5 3"
              strokeWidth={1}
              label={{
                value: `Low: ${refRange.low}`,
                position: 'right',
                fontSize: 9,
                fill: '#F5A623',
              }}
            />
          )}
          {refRange.high !== null && (
            <ReferenceLine
              y={refRange.high}
              stroke="#F5A623"
              strokeDasharray="5 3"
              strokeWidth={1}
              label={{
                value: `High: ${refRange.high}`,
                position: 'right',
                fontSize: 9,
                fill: '#F5A623',
              }}
            />
          )}

          <Line
            type="monotone"
            dataKey="value"
            stroke="#0DD9D9"
            strokeWidth={2}
            dot={(props: Record<string, unknown>) => {
              const { cx, cy, payload } = props as { cx: number; cy: number; payload: { abnormal: boolean } };
              const isAbnormal = payload?.abnormal;
              return (
                <circle
                  key={`${cx}-${cy}`}
                  cx={cx}
                  cy={cy}
                  r={isAbnormal ? 5 : 3.5}
                  fill={isAbnormal ? '#E8394A' : '#0DD9D9'}
                  stroke={isAbnormal ? '#E8394A' : '#0DD9D9'}
                  strokeWidth={isAbnormal ? 2 : 1}
                />
              );
            }}
            activeDot={{
              r: 6,
              stroke: '#0DD9D9',
              strokeWidth: 2,
              fill: '#111B2E',
            }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-edge/15">
        <span className="flex items-center gap-1.5 text-[10px] text-ghost">
          <span className="w-2 h-2 rounded-full bg-teal" />
          Normal
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-ghost">
          <span className="w-2 h-2 rounded-full bg-crimson" />
          Abnormal
        </span>
        {(refRange.low !== null || refRange.high !== null) && (
          <span className="flex items-center gap-1.5 text-[10px] text-ghost">
            <span className="w-4 border-t border-dashed border-amber" />
            Reference Range
          </span>
        )}
      </div>
    </div>
  );
}
