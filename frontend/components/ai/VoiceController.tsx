"use client";


import { useEffect, useRef, useState } from "react";

import { abbyAnalytics } from "@/services/AbbyAnalytics";
import type {
  SpeechRecognition,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
} from "@/types/web-speech";

interface VoiceControllerProps {
  onWakeWord: () => void;
  enabled: boolean;
}

export function VoiceController({ onWakeWord, enabled }: VoiceControllerProps) {
  const [, setIsListening] = useState(false);
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

    if (!SpeechRecognition) {
      console.warn("SpeechRecognition is not defined.");

      return;
    }

    recognitionRef.current = new SpeechRecognition!();

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
      const text = event.results[last][0].transcript.trim().toLowerCase() || "";

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
        .enumerateDevices()
        .then((devices) => {
          const hasAudioInput = devices.some(
            (device) => device.kind === "audioinput",
          );

          if (!hasAudioInput) {
            console.error(
              "No microphone found. Please connect a microphone and try again.",
            );
            setHasPermission(false);

            return;
          }

          return navigator.mediaDevices.getUserMedia({ audio: true });
        })
        .then((stream) => {
          if (stream) {
            setHasPermission(true);
            if (hasPermission) {
              recognition.start();
            }
            // Clean up the stream since we don't need it anymore
            stream.getTracks().forEach((track) => track.stop());
          }
        })
        .catch((error) => {
          console.error(
            "Microphone permission error:",
            error.name,
            error.message,
          );
          setHasPermission(false);

          // Provide specific error messages based on the error type
          switch (error.name) {
            case "NotFoundError":
              abbyAnalytics.trackError(
                "voice_permission_error",
                "No microphone found",
              );
              break;
            case "NotAllowedError":
              abbyAnalytics.trackError(
                "voice_permission_error",
                "Microphone access denied",
              );
              break;
            case "NotReadableError":
              abbyAnalytics.trackError(
                "voice_permission_error",
                "Microphone is already in use",
              );
              break;
            default:
              abbyAnalytics.trackError(
                "voice_permission_error",
                `${error.name}: ${error.message}`,
              );
          }
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
