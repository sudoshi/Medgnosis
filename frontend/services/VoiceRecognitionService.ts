import type { VoiceState, CommandResult } from "@/config/voice";
import { VOICE_CONFIG } from "@/config/voice";
import type {
  SpeechRecognition,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
} from "@/types/web-speech";

import { abbyAnalytics } from "./AbbyAnalytics";


type VoiceCallback = (state: VoiceState) => void;
type CommandCallback = (result: CommandResult) => void;

export class VoiceRecognitionService {
  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private isWaitingForCommand: boolean = false;
  private onStateChange: VoiceCallback | null = null;
  private onCommand: CommandCallback | null = null;
  private retryCount: number = 0;
  private maxRetries: number = 3;
  private commandBuffer: string = "";
  private commandTimeout: NodeJS.Timeout | null = null;
  private lastWakeWordTime: number = 0;
  private wakeWordCooldown: number = 2000; // 2 seconds cooldown

  constructor() {
    if (typeof window !== "undefined") {
      this.initializeSpeechRecognition();
    }
  }

  private initializeSpeechRecognition() {
    const SpeechRecognitionImpl =
      window.webkitSpeechRecognition || window.SpeechRecognition;
    const SpeechGrammarListImpl =
      window.webkitSpeechGrammarList || window.SpeechGrammarList;

    if (!SpeechRecognitionImpl || !SpeechGrammarListImpl) {
      this.updateState({
        isListening: false,
        isProcessing: false,
        error: "Speech recognition is not supported in this browser",
        transcript: "",
      });

      return;
    }

    try {
      const recognition = new SpeechRecognitionImpl();

      recognition.grammars = new SpeechGrammarListImpl();
      recognition.continuous = VOICE_CONFIG.recognition.continuous;
      recognition.interimResults = VOICE_CONFIG.recognition.interimResults;
      recognition.lang = VOICE_CONFIG.recognition.language;
      recognition.maxAlternatives = 1;

      this.recognition = recognition;
      this.configureRecognition();
    } catch (error) {
      console.error("Failed to initialize speech recognition:", error);
      this.updateState({
        isListening: false,
        isProcessing: false,
        error: "Failed to initialize speech recognition",
        transcript: "",
      });
    }
  }

  private configureRecognition() {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.updateState({
        isListening: true,
        isProcessing: false,
        error: null,
        transcript: "",
      });
      abbyAnalytics.trackEvent("voice_recognition_start", {});
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.updateState({
        isListening: false,
        isProcessing: false,
        error: null,
        transcript: "",
      });

      if (this.shouldRetry()) {
        this.retryRecognition();
      } else {
        abbyAnalytics.trackEvent("voice_recognition_end", {});
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorMessage = `Recognition error: ${event.error}`;

      this.updateState({
        isListening: false,
        isProcessing: false,
        error: errorMessage,
        transcript: "",
      });
      abbyAnalytics.trackError("voice_recognition_error", errorMessage);

      switch (event.error) {
        case "network":
          this.handleNetworkError();
          break;
        case "not-allowed":
          this.handlePermissionError();
          break;
        case "no-speech":
          this.handleNoSpeechError();
          break;
        default:
          this.handleGenericError(event.error);
      }
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];

        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      const transcript = (finalTranscript || interimTranscript).toLowerCase();

      this.updateState({
        isListening: true,
        isProcessing: true,
        error: null,
        transcript,
      });

      if (finalTranscript) {
        this.processTranscript(finalTranscript.toLowerCase());
      }
    };
  }

  private updateState(state: VoiceState) {
    this.onStateChange?.(state);
  }

  private shouldRetry(): boolean {
    return (
      this.isListening &&
      this.retryCount < this.maxRetries &&
      !this.isWaitingForCommand
    );
  }

  private async retryRecognition() {
    this.retryCount++;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.start();
  }

  private handleNetworkError() {
    setTimeout(() => this.start(), 5000);
  }

  private handlePermissionError() {
    this.updateState({
      isListening: false,
      isProcessing: false,
      error: VOICE_CONFIG.responses.noPermission,
      transcript: "",
    });
  }

  private handleNoSpeechError() {
    if (this.isWaitingForCommand) {
      this.isWaitingForCommand = false;
      this.commandBuffer = "";
      this.clearCommandTimeout();
    }
  }

  private handleGenericError(error: string) {
    console.error("Speech recognition error:", error);
  }

  private processTranscript(transcript: string) {
    const now = Date.now();
    const wakeWord = VOICE_CONFIG.wakeWord.keyword;

    if (!this.isWaitingForCommand) {
      if (
        transcript.includes(wakeWord) &&
        now - this.lastWakeWordTime > this.wakeWordCooldown
      ) {
        this.lastWakeWordTime = now;
        this.handleWakeWord();

        return;
      }
    } else {
      this.commandBuffer += " " + transcript;
      this.clearCommandTimeout();
      this.setCommandTimeout();

      if (this.isCompleteCommand(this.commandBuffer)) {
        this.processCommand(this.commandBuffer.trim());
        this.resetCommandState();
      }
    }
  }

  private handleWakeWord() {
    this.isWaitingForCommand = true;
    this.commandBuffer = "";
    this.setCommandTimeout();

    this.onCommand?.({
      success: true,
      action: "WAKE",
      response: VOICE_CONFIG.responses.greeting,
    });

    abbyAnalytics.trackEvent("wake_word_detected", {});
  }

  private setCommandTimeout() {
    this.clearCommandTimeout();
    this.commandTimeout = setTimeout(() => {
      if (this.commandBuffer.trim()) {
        this.processCommand(this.commandBuffer.trim());
      }
      this.resetCommandState();
    }, 2000);
  }

  private clearCommandTimeout() {
    if (this.commandTimeout) {
      clearTimeout(this.commandTimeout);
      this.commandTimeout = null;
    }
  }

  private resetCommandState() {
    this.isWaitingForCommand = false;
    this.commandBuffer = "";
    this.clearCommandTimeout();
  }

  private isCompleteCommand(text: string): boolean {
    return (
      Object.keys(VOICE_CONFIG.commands.navigation).some((cmd) =>
        text.includes(cmd),
      ) ||
      Object.keys(VOICE_CONFIG.commands.actions).some((cmd) =>
        text.includes(cmd),
      )
    );
  }

  private processCommand(transcript: string) {
    abbyAnalytics.trackEvent("command_processing", { transcript });

    for (const [command, path] of Object.entries(
      VOICE_CONFIG.commands.navigation,
    )) {
      if (transcript.includes(command)) {
        this.onCommand?.({
          success: true,
          action: "NAVIGATE",
          response: path,
        });
        abbyAnalytics.trackEvent("navigation_command", { command, path });

        return;
      }
    }

    for (const [command, details] of Object.entries(
      VOICE_CONFIG.commands.actions,
    )) {
      if (transcript.includes(command)) {
        this.onCommand?.({
          success: true,
          action: details.action,
          response: details.response,
        });
        abbyAnalytics.trackEvent("action_command", {
          command,
          action: details.action,
        });

        return;
      }
    }

    this.onCommand?.({
      success: false,
      error: VOICE_CONFIG.responses.error,
    });
    abbyAnalytics.trackEvent("command_not_recognized", { transcript });
  }

  public start() {
    if (!this.recognition) {
      this.initializeSpeechRecognition();

      return;
    }

    if (!this.isListening) {
      try {
        this.recognition.start();
        this.retryCount = 0;
      } catch (error) {
        console.error("Failed to start voice recognition:", error);
        abbyAnalytics.trackError(
          "voice_recognition_start_error",
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    }
  }

  public stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
        this.resetCommandState();
      } catch (error) {
        console.error("Failed to stop voice recognition:", error);
        abbyAnalytics.trackError(
          "voice_recognition_stop_error",
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    }
  }

  public subscribe(onState: VoiceCallback, onCommand: CommandCallback) {
    this.onStateChange = onState;
    this.onCommand = onCommand;
  }

  public unsubscribe() {
    this.onStateChange = null;
    this.onCommand = null;
    this.resetCommandState();
  }
}

// Export singleton instance
export const voiceRecognition = new VoiceRecognitionService();
