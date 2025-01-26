"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

import { AbbyModal } from "./AbbyModal";
import { VoiceController } from "./VoiceController";

export function AbbyAssistant() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  useEffect(() => {
    // Check if voice features were previously enabled
    const savedVoicePreference = localStorage.getItem("abbyVoiceEnabled");

    if (savedVoicePreference === "true") {
      setVoiceEnabled(true);
    }
  }, []);

  const handleWakeWord = () => {
    setIsModalOpen(true);
  };

  return (
    <>
      {voiceEnabled && (
        <VoiceController enabled={voiceEnabled} onWakeWord={handleWakeWord} />
      )}
      <button
        aria-label="Open Abby AI Assistant"
        className={`relative rounded-full w-52 aspect-square mx-auto transition-all duration-300 ${
          isActive ? "shadow-glow-accent" : "hover:shadow-glow-accent"
        } ${voiceEnabled && isActive ? "animate-pulse" : ""}`}
        onClick={() => setIsModalOpen(true)}
      >
        <div className="relative w-full h-full rounded-full overflow-hidden">
          <Image
            fill
            alt="Abby AI Assistant"
            className="object-cover"
            src="/images/Abby-AI.png"
          />
        </div>
        {isActive && (
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-accent-success rounded-full border-2 border-dark-primary" />
        )}
      </button>

      <AbbyModal
        isOpen={isModalOpen}
        setIsActive={setIsActive}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
