"use client";

export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-dark">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative h-16 w-16 animate-spin">
          <div className="absolute inset-0 rounded-full border-4 border-dark-secondary" />
          <div className="absolute inset-0 rounded-full border-4 border-accent-primary border-t-transparent animate-spin" />
        </div>
        <p className="text-dark-text-secondary">Loading...</p>
      </div>
    </div>
  );
}
