"use client"
import { useState } from "react";

interface VisitTypeToggleProps {
  onSelect: (type: "initial" | "follow-up" | "procedure") => void;
}

export function VisitTypeToggle({ onSelect }: VisitTypeToggleProps) {
  const [selected, setSelected] = useState<
    "initial" | "follow-up" | "procedure"
  >("initial");

  const handleSelect = (type: "initial" | "follow-up" | "procedure") => {
    setSelected(type);
    onSelect(type);
  };

  return (
    <div className="flex space-x-2 p-1 bg-dark-secondary/10 rounded-lg">
      <button
        className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
          selected === "initial"
            ? "bg-white dark:bg-dark-primary text-accent-primary shadow-sm"
            : "text-dark-text-secondary hover:text-dark-text-primary hover:bg-dark-secondary/5"
        }`}
        onClick={() => handleSelect("initial")}
      >
        Initial Visit
      </button>
      <button
        className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
          selected === "follow-up"
            ? "bg-white dark:bg-dark-primary text-accent-primary shadow-sm"
            : "text-dark-text-secondary hover:text-dark-text-primary hover:bg-dark-secondary/5"
        }`}
        onClick={() => handleSelect("follow-up")}
      >
        Follow-up
      </button>
      <button
        className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
          selected === "procedure"
            ? "bg-white dark:bg-dark-primary text-accent-primary shadow-sm"
            : "text-dark-text-secondary hover:text-dark-text-primary hover:bg-dark-secondary/5"
        }`}
        onClick={() => handleSelect("procedure")}
      >
        Procedure
      </button>
    </div>
  );
}
