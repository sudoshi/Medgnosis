"use client";

import { useEffect, useRef, useState } from "react";

interface VoiceControllerProps {
  onWakeWord: () => void;
  enabled: boolean;
}

// Web Speech API type definitions
interface SpeechRecognitionEvent extends Event {
  results: {
    length: number;
    item(index: number): {
      item(index: number): {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onstart: (event: Event) => void;
  onend: (event: Event) => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    webkitSpeechRecognition: SpeechRecognitionConstructor;
    SpeechRecognition: SpeechRecognitionConstructor;
  }
}

export function VoiceController({ onWakeWord, enabled }: VoiceControllerProps) {
  const [isListening, setIsListening] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    // Check if browser supports speech recognition
    if (
      !("webkitSpeechRecognition" in window) &&
      !("SpeechRecognition" in window)
    ) {
      console.warn("Speech recognition is not supported in this browser.");

      return;
    }

    // Initialize speech recognition
    const SpeechRecognition =
      window.webkitSpeechRecognition || window.SpeechRecognition;

    recognitionRef.current = new SpeechRecognition();

    const recognition = recognitionRef.current;

    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (enabled && hasPermission) {
        recognition.start(); // Restart if enabled
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results.length - 1;
      const text = event.results
        .item(last)
        .item(0)
        .transcript.trim()
        .toLowerCase();

      if (text.includes("hey abby")) {
        onWakeWord();
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") {
        setHasPermission(false);
      }
      console.error("Speech recognition error:", event.error);
    };

    // Request microphone permission
    if (enabled) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(() => {
          setHasPermission(true);
          recognition.start();
        })
        .catch(() => {
          setHasPermission(false);
        });
    }

    return () => {
      if (recognition) {
        recognition.stop();
      }
    };
  }, [enabled, onWakeWord, hasPermission]);

  // Component doesn't render anything visible
  return null;
}
