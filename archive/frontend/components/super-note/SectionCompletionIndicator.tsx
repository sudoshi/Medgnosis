import { CheckCircle2, Circle } from "lucide-react";

interface SubsectionStatus {
  name: string;
  isComplete: boolean;
}

interface SectionCompletionIndicatorProps {
  isComplete: boolean;
  subsections?: SubsectionStatus[];
}

export function SectionCompletionIndicator({
  isComplete,
  subsections,
}: SectionCompletionIndicatorProps) {
  if (!subsections) {
    return isComplete ? (
      <CheckCircle2 className="h-4 w-4 text-accent-success" />
    ) : (
      <Circle className="h-4 w-4 text-dark-text-secondary/30" />
    );
  }

  const completedCount = subsections.filter((sub) => sub.isComplete).length;
  const totalCount = subsections.length;
  const percentage = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="flex items-center space-x-2">
      <div className="text-xs font-medium text-dark-text-secondary">
        {completedCount}/{totalCount}
      </div>
      <div className="relative h-1.5 w-12 bg-dark-secondary/10 rounded-full overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${
            percentage === 100
              ? "bg-accent-success"
              : percentage > 0
                ? "bg-accent-primary"
                : "bg-dark-text-secondary/30"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
