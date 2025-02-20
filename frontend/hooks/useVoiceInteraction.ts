
import { useState, useEffect, useCallback } from "react";

import type { VoiceState, CommandResult } from "@/config/voice";
import { audioFeedback } from "@/services/AudioFeedbackService";
import { useVoiceCommandProcessor } from "@/services/VoiceCommandProcessor";
import { voiceRecognition } from "@/services/VoiceRecognitionService";

interface VoiceInteractionState extends VoiceState {
  lastResponse: string | null;
  lastError: string | null;
}

export function useVoiceInteraction(enabled: boolean = false) {
  const [state, setState] = useState<VoiceInteractionState>({
    isListening: false,
    isProcessing: false,
    error: null,
    transcript: "",
    lastResponse: null,
    lastError: null,
  });

  const commandProcessor = useVoiceCommandProcessor();

  const handleVoiceState = useCallback((voiceState: VoiceState) => {
    setState((prev) => ({
      ...prev,
      ...voiceState,
    }));
  }, []);

  const handleCommand = useCallback(
    async (result: CommandResult) => {
      if (result.success) {
        if (result.response) {
          setState((prev) => ({
            ...prev,
            lastResponse: result.response || null,
            lastError: null,
          }));
          await commandProcessor.speakResponse(result.response);
        }
      } else if (result.error) {
        setState((prev) => ({
          ...prev,
          lastError: result.error || null,
          lastResponse: null,
        }));
        await audioFeedback.playError();
      }
    },
    [commandProcessor],
  );

  useEffect(() => {
    if (enabled) {
      voiceRecognition.subscribe(handleVoiceState, handleCommand);
      voiceRecognition.start();
    } else {
      voiceRecognition.stop();
      voiceRecognition.unsubscribe();
    }

    return () => {
      voiceRecognition.stop();
      voiceRecognition.unsubscribe();
    };
  }, [enabled, handleVoiceState, handleCommand]);

  const startListening = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isListening: true,
      error: null,
    }));
    voiceRecognition.start();
  }, []);

  const stopListening = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isListening: false,
    }));
    voiceRecognition.stop();
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    isEnabled: enabled,
  };
}
