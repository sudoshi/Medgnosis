import type { DashboardData } from '@/services/api';
import {
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';

interface QualityMeasuresProps {
  data: DashboardData['qualityMeasures'];
  loading?: boolean;
}

interface PerformanceCardProps {
  measure: DashboardData['qualityMeasures']['performance']['measures'][0];
}

function PerformanceCard({ measure }: PerformanceCardProps) {
  const isImproving = measure.trend > 0;
  const progressPercentage = (measure.score / measure.target) * 100;

  return (
    <div className="panel-detail p-4 relative">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-medium">{measure.name}</h4>
          <div className="mt-2 flex items-center space-x-2">
            <span className="text-2xl font-semibold">{measure.score}%</span>
            <span className="text-sm text-dark-text-secondary">
              of {measure.target}% target
            </span>
          </div>
        </div>
        <div className={`flex items-center space-x-1 ${
          isImproving ? 'text-accent-success' : 'text-accent-error'
        }`}>
          {isImproving ? (
            <ArrowTrendingUpIcon className="h-4 w-4" />
          ) : (
            <ArrowTrendingDownIcon className="h-4 w-4" />
          )}
          <span className="text-sm">{Math.abs(measure.trend)}%</span>
        </div>
      </div>
      <div className="mt-3">
        <div className="h-2 rounded-full bg-dark-secondary/30 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              progressPercentage >= 100
                ? 'bg-accent-success/70'
                : progressPercentage >= 75
                ? 'bg-accent-warning/70'
                : 'bg-accent-error/70'
            }`}
            style={{ width: `${Math.min(progressPercentage, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

interface TrendChartProps {
  data: DashboardData['qualityMeasures']['trends']['monthly'];
}

function TrendChart({ data }: TrendChartProps) {
  const maxScore = Math.max(...data.map(d => d.score));
  const minScore = Math.min(...data.map(d => d.score));
  const range = maxScore - minScore;
  const normalizeHeight = (score: number) => 
    ((score - minScore) / (range || 1)) * 100;

  return (
    <div className="h-40 flex items-end justify-between">
      {data.map((point, index) => (
        <div
          key={point.month}
          className="flex flex-col items-center space-y-2"
          style={{ height: '100%' }}
        >
          <div className="flex-1 w-12 flex items-end">
            <div
              className="w-8 bg-accent-primary/70 rounded-t transition-all duration-200 hover:bg-accent-primary/80"
              style={{ height: `${normalizeHeight(point.score)}%` }}
            />
          </div>
          <div className="text-xs text-dark-text-secondary">{point.month}</div>
          <div className="text-sm font-medium">{point.score}%</div>
        </div>
      ))}
    </div>
  );
}

interface ImprovementCardProps {
  item: DashboardData['qualityMeasures']['improvement'][0];
}

function ImprovementCard({ item }: ImprovementCardProps) {
  return (
    <div className="panel-detail p-4 relative hover:bg-dark-secondary/20 transition-all duration-200">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-medium">{item.measure}</h4>
          <p className="mt-1 text-sm text-dark-text-secondary">{item.gap}</p>
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-sm font-medium ${
            item.impact === 'High'
              ? 'text-accent-error'
              : item.impact === 'Medium'
              ? 'text-accent-warning'
              : 'text-accent-success'
          }`}>
            {item.impact} Impact
          </span>
          <span className="text-sm text-accent-success">{item.potential}</span>
        </div>
      </div>
    </div>
  );
}

export default function QualityMeasures({ data, loading }: QualityMeasuresProps) {
  if (loading) {
    return <div className="animate-pulse">Loading quality measures...</div>;
  }

  const { performance, trends, improvement } = data;

  return (
    <div className="space-y-6">
      {/* Overall Performance */}
      <div className="panel-analytics relative">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-dark-text-primary">Quality Performance</h3>
          <div className="flex items-center space-x-2 bg-dark-secondary/20 rounded-lg px-3 py-2 transition-all duration-200 hover:bg-dark-secondary/30">
            <ChartBarIcon className="h-5 w-5 text-accent-primary" />
            <span className="text-2xl font-semibold">
              {performance.overall}%
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {performance.measures.map((measure) => (
            <PerformanceCard key={measure.id} measure={measure} />
          ))}
        </div>
      </div>

      {/* Performance Trend */}
      <div className="panel-analytics relative">
        <h3 className="text-lg font-semibold mb-4 text-dark-text-primary">Performance Trend</h3>
        <TrendChart data={trends.monthly} />
      </div>

      {/* Improvement Opportunities */}
      <div className="panel-analytics relative">
        <h3 className="text-lg font-semibold mb-4 text-dark-text-primary">
          Improvement Opportunities
        </h3>
        <div className="space-y-4">
          {improvement.map((item) => (
            <ImprovementCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
