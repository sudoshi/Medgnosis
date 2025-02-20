'use client';

import { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import type {
  ChartData,
  ChartOptions,
  ChartType,
} from 'chart.js';
import { Chart as ChartComponent } from 'react-chartjs-2';
import { cn } from '@/lib/utils';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

// Default chart options
const defaultOptions: ChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
      labels: {
        color: '#94A3B8', // text-dark-text-secondary
      },
    },
  },
  scales: {
    x: {
      grid: {
        color: '#334155', // border-dark-border
      },
      ticks: {
        color: '#94A3B8', // text-dark-text-secondary
      },
    },
    y: {
      grid: {
        color: '#334155', // border-dark-border
      },
      ticks: {
        color: '#94A3B8', // text-dark-text-secondary
      },
    },
  },
};

export interface ChartProps {
  type: ChartType;
  data: ChartData<ChartType>;
  options?: ChartOptions;
  height?: number;
  width?: number;
  className?: string;
  loading?: boolean;
}

export function Chart({
  type,
  data,
  options,
  height = 300,
  width,
  className,
  loading = false,
}: ChartProps) {
  const chartRef = useRef<ChartJS>(null);

  useEffect(() => {
    // Update chart on theme change
    const chart = chartRef.current;
    if (chart) {
      chart.update();
    }
  }, []);

  if (loading) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg border border-dark-border bg-dark-secondary',
          className
        )}
        style={{ height }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-border border-t-accent-primary" />
      </div>
    );
  }

  const mergedOptions: ChartOptions = {
    ...defaultOptions,
    ...options,
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-dark-border bg-dark-secondary p-4',
        className
      )}
      style={{ height: height + 32 }} // Add padding to height
    >
      <ChartComponent
        ref={chartRef}
        type={type}
        data={data}
        options={mergedOptions}
        height={height}
        width={width}
      />
    </div>
  );
}

// Utility functions for common chart types
export function LineChart(props: Omit<ChartProps, 'type'>) {
  return <Chart {...props} type="line" />;
}

export function BarChart(props: Omit<ChartProps, 'type'>) {
  return <Chart {...props} type="bar" />;
}

export function PieChart(props: Omit<ChartProps, 'type'>) {
  return <Chart {...props} type="pie" />;
}

export function DoughnutChart(props: Omit<ChartProps, 'type'>) {
  return <Chart {...props} type="doughnut" />;
}

// Helper function to generate gradient colors
export function createGradient(
  ctx: CanvasRenderingContext2D,
  area: { bottom: number; top: number },
  startColor: string,
  endColor: string
) {
  const gradient = ctx.createLinearGradient(0, area.bottom, 0, area.top);
  gradient.addColorStop(0, startColor);
  gradient.addColorStop(1, endColor);
  return gradient;
}

// Helper function to generate chart colors with opacity
export function withOpacity(color: string, opacity: number) {
  return color.replace(')', `, ${opacity})`).replace('rgb', 'rgba');
}
