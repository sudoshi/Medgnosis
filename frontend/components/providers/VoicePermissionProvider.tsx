"use client";

import type { ReactNode } from "react";

import { createContext, useContext, useEffect, useState } from "react";

import { MicrophonePermission } from "../ai/MicrophonePermission";

interface VoicePermissionContextType {
  hasPermission: boolean | null;
  setHasPermission: (value: boolean) => void;
  showPermissionModal: boolean;
  setShowPermissionModal: (value: boolean) => void;
}

const VoicePermissionContext = createContext<VoicePermissionContextType | null>(
  null,
);

export function useVoicePermission() {
  const context = useContext(VoicePermissionContext);

  if (!context) {
    throw new Error(
      "useVoicePermission must be used within a VoicePermissionProvider",
    );
  }

  return context;
}

interface VoicePermissionProviderProps {
  children: ReactNode;
}

export function VoicePermissionProvider({
  children,
}: VoicePermissionProviderProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  useEffect(() => {
    // Check if this is the first time loading the dashboard
    const permissionChecked = localStorage.getItem(
      "abbyVoicePermissionChecked",
    );

    if (!permissionChecked) {
      // First time user, show the permission modal
      setShowPermissionModal(true);
    } else {
      // Load saved permission state
      const savedPermission = localStorage.getItem("abbyVoiceEnabled");

      setHasPermission(savedPermission === "true");
    }
  }, []);

  const handlePermissionAllow = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasPermission(true);
      localStorage.setItem("abbyVoiceEnabled", "true");
      localStorage.setItem("abbyVoicePermissionChecked", "true");
      setShowPermissionModal(false);
    } catch (error) {
      console.error("Microphone permission denied:", error);
      setHasPermission(false);
      localStorage.setItem("abbyVoiceEnabled", "false");
      localStorage.setItem("abbyVoicePermissionChecked", "true");
      setShowPermissionModal(false);
    }
  };

  const handlePermissionDeny = () => {
    setHasPermission(false);
    localStorage.setItem("abbyVoiceEnabled", "false");
    localStorage.setItem("abbyVoicePermissionChecked", "true");
    setShowPermissionModal(false);
  };

  return (
    <VoicePermissionContext.Provider
      value={{
        hasPermission,
        setHasPermission,
        showPermissionModal,
        setShowPermissionModal,
      }}
    >
      <MicrophonePermission
        isOpen={showPermissionModal}
        onAllow={handlePermissionAllow}
        onDeny={handlePermissionDeny}
      />
      {children}
    </VoicePermissionContext.Provider>
  );
}
