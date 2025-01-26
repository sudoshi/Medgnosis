"use client";

import { MicrophoneIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface MicrophonePermissionProps {
  onAllow: () => void;
  onDeny: () => void;
  isOpen: boolean;
}

export function MicrophonePermission({
  onAllow,
  onDeny,
  isOpen,
}: MicrophonePermissionProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[400px] rounded-lg bg-dark-primary p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Enable Voice Features</h3>
          <button
            className="rounded p-1 hover:bg-dark-secondary"
            onClick={onDeny}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 space-y-4">
          <div className="flex items-center justify-center rounded-full bg-accent-primary/10 p-6">
            <MicrophoneIcon className="h-12 w-12 text-accent-primary" />
          </div>
          <p className="text-center text-dark-text-secondary">
            Abby needs microphone access to enable voice commands. This allows
            you to activate Abby by saying "Hey Abby" and use voice
            interactions.
          </p>
        </div>

        <div className="flex justify-end space-x-4">
          <button
            className="rounded-lg px-4 py-2 text-dark-text-secondary hover:bg-dark-secondary"
            onClick={onDeny}
          >
            Not Now
          </button>
          <button
            className="rounded-lg bg-accent-primary px-4 py-2 text-white hover:bg-accent-primary/80"
            onClick={onAllow}
          >
            Allow Microphone
          </button>
        </div>
      </div>
    </div>
  );
}
