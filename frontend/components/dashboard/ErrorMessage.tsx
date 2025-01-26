import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ErrorMessage({
  message,
  onRetry,
  isRetrying,
}: ErrorMessageProps) {
  return (
    <div className="p-4 bg-accent-error/10 text-accent-error rounded-lg flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <ExclamationTriangleIcon className="h-5 w-5" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          className={`px-3 py-1 rounded text-sm transition-colors duration-200 ${
            isRetrying
              ? "bg-accent-error/10 cursor-not-allowed"
              : "bg-accent-error/20 hover:bg-accent-error/30"
          }`}
          disabled={isRetrying}
          onClick={onRetry}
        >
          <div className="flex items-center space-x-1">
            <ArrowPathIcon
              className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
            />
            <span>Retry</span>
          </div>
        </button>
      )}
    </div>
  );
}
