"use client";

import { useEffect, useRef, useState } from "react";
import { abbyAnalytics } from "@/services/AbbyAnalytics";
import { ollamaService } from "@/services/OllamaService";

import type {
  SpeechRecognition,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
} from "@/types/web-speech";

interface VoiceControllerProps {
  onWakeWord: () => void;
  enabled: boolean;
  onResponse?: (response: string) => void;
  onListeningChange?: (isListening: boolean) => void;
}

export function VoiceController({ onWakeWord, enabled, onResponse, onListeningChange }: VoiceControllerProps) {
  const [isListening, setIsListening] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastWakeWordRef = useRef<number>(0);

  // Update parent component about listening state changes
  useEffect(() => {
    onListeningChange?.(isListening);
  }, [isListening, onListeningChange]);

  const speak = async (text: string) => {
    if (!synthRef.current || !utteranceRef.current) return;
    
    utteranceRef.current.text = text;
    utteranceRef.current.onend = () => {
      if (enabled && hasPermission && !isProcessing) {
        // Add a small delay before restarting recognition
        setTimeout(() => {
          recognitionRef.current?.start();
        }, 500);
      }
    };
    
    // Cancel any ongoing speech
    synthRef.current.cancel();
    synthRef.current.speak(utteranceRef.current);
  };

  // Initialize speech synthesis
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
      utteranceRef.current = new SpeechSynthesisUtterance();
      utteranceRef.current.rate = 1.0;
      utteranceRef.current.pitch = 1.0;
      utteranceRef.current.volume = 1.0;
    }
  }, []);

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
      onListeningChange?.(true);
    };

    recognition.onend = () => {
      setIsListening(false);
      onListeningChange?.(false);
      if (enabled && hasPermission) {
        recognition.start(); // Restart if enabled
      }
    };

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      const last = event.results.length - 1;
      const text = event.results[last][0].transcript.trim().toLowerCase() || "";

      // Debounce wake word detection
      const now = Date.now();
      if ((text.includes("hey abby") || text.includes("hey abbey")) && 
          now - lastWakeWordRef.current > 3000) { // Prevent triggering more than once every 3 seconds
        lastWakeWordRef.current = now;
        setIsProcessing(true);
        onWakeWord();
        await speak("Yes, how can I help you?");
        recognition.stop();
        setTimeout(() => {
          if (enabled && hasPermission) {
            recognition.start();
          }
        }, 1000);
      } else if (isProcessing && !text.includes("hey abby")) {
        try {
          const stream = await ollamaService.chat(text);
          const reader = stream.getReader();
          let responseText = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            responseText += chunk;
          }

          if (onResponse) {
            onResponse(responseText);
          }
          await speak(responseText);
        } catch (error) {
          console.error('Error processing request:', error);
          await speak('I apologize, but I encountered an error processing your request.');
        } finally {
          setIsProcessing(false);
        }
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
