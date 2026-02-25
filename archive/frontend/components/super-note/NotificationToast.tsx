"use client"
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect } from "react";

interface NotificationToastProps {
  type: "success" | "error";
  message: string;
  onClose: () => void;
  duration?: number;
}

export function NotificationToast({
  type,
  message,
  onClose,
  duration = 5000,
}: NotificationToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 flex items-center space-x-2 px-4 py-3 rounded-lg shadow-lg transition-all duration-300 ${
        type === "success"
          ? "bg-accent-success/90 text-white"
          : "bg-accent-error/90 text-white"
      }`}
    >
      {type === "success" ? (
        <CheckCircleIcon className="h-5 w-5" />
      ) : (
        <ExclamationCircleIcon className="h-5 w-5" />
      )}
      <span className="text-sm font-medium">{message}</span>
      <button
        className="ml-2 p-1 hover:bg-white/20 rounded-full transition-colors duration-200"
        onClick={onClose}
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
