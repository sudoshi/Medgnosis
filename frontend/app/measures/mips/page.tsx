"use client";

import {
  ChartBarIcon,
  ClipboardDocumentCheckIcon,
  ComputerDesktopIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";

export default function MeasuresMipsPage() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* MIPS Overview */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-3">
          Merit-based Incentive Payment System (MIPS)
        </h1>
        <p className="text-light-text-secondary dark:text-dark-text-secondary mb-4">
          A program that evaluates the performance of Medicare Part B clinicians
          using a composite score to determine payment adjustments.
        </p>
      </div>

      {/* MIPS Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Quality Category */}
        <div className="panel-analytics relative">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <ChartBarIcon className="h-6 w-6 text-blue-500" />
                <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                  Quality
                </h2>
              </div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary mt-2">
                Measures healthcare processes, outcomes, and patient experiences
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Weight
              </div>
              <div className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                30%
              </div>
            </div>
          </div>
          <div className="h-2 bg-light-secondary dark:bg-dark-primary rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 w-3/4" />
          </div>
          <div className="mt-2 text-right text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Score: 75/100
          </div>
        </div>

        {/* Improvement Activities */}
        <div className="panel-analytics relative">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <ClipboardDocumentCheckIcon className="h-6 w-6 text-green-500" />
                <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                  Improvement Activities
                </h2>
              </div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary mt-2">
                Activities for improving clinical practice
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Weight
              </div>
              <div className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                15%
              </div>
            </div>
          </div>
          <div className="h-2 bg-light-secondary dark:bg-dark-primary rounded-full overflow-hidden">
            <div className="h-full bg-green-500 w-full" />
          </div>
          <div className="mt-2 text-right text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Score: 100/100
          </div>
        </div>

        {/* Promoting Interoperability */}
        <div className="panel-analytics relative">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <ComputerDesktopIcon className="h-6 w-6 text-purple-500" />
                <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                  Promoting Interoperability
                </h2>
              </div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary mt-2">
                Use of certified EHR technology
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Weight
              </div>
              <div className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                25%
              </div>
            </div>
          </div>
          <div className="h-2 bg-light-secondary dark:bg-dark-primary rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 w-4/5" />
          </div>
          <div className="mt-2 text-right text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Score: 80/100
          </div>
        </div>

        {/* Cost */}
        <div className="panel-analytics relative">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <BanknotesIcon className="h-6 w-6 text-yellow-500" />
                <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                  Cost
                </h2>
              </div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary mt-2">
                Medicare claims data to assess cost efficiency
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Weight
              </div>
              <div className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                30%
              </div>
            </div>
          </div>
          <div className="h-2 bg-light-secondary dark:bg-dark-primary rounded-full overflow-hidden">
            <div className="h-full bg-yellow-500 w-2/3" />
          </div>
          <div className="mt-2 text-right text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Score: 65/100
          </div>
        </div>
      </div>

      {/* Composite Score */}
      <div className="panel-base relative mb-8">
        <h2 className="text-xl font-semibold mb-4 text-light-text-primary dark:text-dark-text-primary">
          MIPS Composite Score
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-4 bg-light-secondary dark:bg-dark-primary rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 w-[77%]" />
            </div>
          </div>
          <div className="text-3xl font-bold text-light-text-primary dark:text-dark-text-primary">
            77
          </div>
        </div>
        <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
          <div className="text-green-500 font-semibold">
            Positive Payment Adjustment
          </div>
          <p className="text-light-text-secondary dark:text-dark-text-secondary mt-1">
            Based on your composite score, you are eligible for a positive
            payment adjustment in the next payment year.
          </p>
        </div>
      </div>
    </div>
  );
}
