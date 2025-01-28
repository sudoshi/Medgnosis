"use client";

import { useEffect } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

import AdminLayout from "@/components/layout/AdminLayout";

export default function SuperNoteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("SuperNote Error:", error);
  }, [error]);

  return (
    <AdminLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-accent-error/10">
          <ExclamationTriangleIcon className="w-8 h-8 text-accent-error" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">Something went wrong</h2>
          <p className="text-dark-text-secondary">
            {error.message || "An error occurred while loading SuperNote"}
          </p>
        </div>
        <button
          className="px-4 py-2 rounded-lg bg-accent-primary hover:bg-accent-primary/80 text-white transition-all duration-200"
          onClick={reset}
        >
          Try again
        </button>
      </div>
    </AdminLayout>
  );
}
