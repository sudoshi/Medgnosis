import type { CommandResult } from "@/config/voice";

import { useRouter } from "next/navigation";

import { audioFeedback } from "./AudioFeedbackService";
import { abbyVoice } from "./AbbyVoice";
import { abbyAnalytics } from "./AbbyAnalytics";

import { VOICE_CONFIG } from "@/config/voice";

export class VoiceCommandProcessor {
  private router: ReturnType<typeof useRouter>;

  constructor(router: ReturnType<typeof useRouter>) {
    this.router = router;
  }

  public async processCommand(transcript: string): Promise<CommandResult> {
    await audioFeedback.playProcessing();
    abbyAnalytics.trackEvent("command_processing", { transcript });

    // First, check if it's a wake word
    if (transcript.toLowerCase().includes(VOICE_CONFIG.wakeWord.keyword)) {
      await audioFeedback.playActivation();
      abbyAnalytics.trackEvent("wake_word_detected", {});

      return {
        success: true,
        action: "WAKE",
        response: VOICE_CONFIG.responses.greeting,
      };
    }

    // Check navigation commands
    for (const [command, path] of Object.entries(
      VOICE_CONFIG.commands.navigation,
    )) {
      if (transcript.includes(command)) {
        await this.handleNavigationCommand(path);
        abbyAnalytics.trackEvent("navigation_command", { command, path });

        return {
          success: true,
          action: "NAVIGATE",
          response: `Navigating to ${command}...`,
        };
      }
    }

    // Check action commands
    for (const [command, details] of Object.entries(
      VOICE_CONFIG.commands.actions,
    )) {
      if (transcript.includes(command)) {
        await this.handleActionCommand(details.action, details.response);
        abbyAnalytics.trackEvent("action_command", {
          command,
          action: details.action,
        });

        return {
          success: true,
          action: details.action,
          response: details.response,
        };
      }
    }

    // No matching command found
    await audioFeedback.playError();
    abbyAnalytics.trackEvent("command_not_recognized", { transcript });

    return {
      success: false,
      error: VOICE_CONFIG.responses.error,
    };
  }

  private async handleNavigationCommand(path: string): Promise<void> {
    try {
      this.router.push(path);
      await audioFeedback.playActivation();
    } catch (error) {
      console.error("Navigation error:", error);
      await audioFeedback.playError();
      abbyAnalytics.trackError(
        "navigation_error",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  private async handleActionCommand(
    action: string,
    response: string,
  ): Promise<void> {
    try {
      switch (action) {
        case "SHOW_HIGH_RISK":
          // Filter patients by risk score
          this.router.push("/patients?risk=high");
          await audioFeedback.playActivation();
          break;

        case "SHOW_CARE_GAPS":
          // Show care gaps summary
          this.router.push("/care-lists");
          await audioFeedback.playActivation();
          break;

        default:
          console.warn("Unknown action:", action);
          await audioFeedback.playError();
          abbyAnalytics.trackError("unknown_action", action);
      }
    } catch (error) {
      console.error("Action error:", error);
      await audioFeedback.playError();
      abbyAnalytics.trackError(
        "action_error",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  public async speakResponse(text: string): Promise<void> {
    try {
      await abbyVoice.speak(text, {
        emotion: "professional",
        rate: 1.0,
      });
    } catch (error) {
      console.error("Speech synthesis error:", error);
      abbyAnalytics.trackError(
        "speech_synthesis_error",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }
}

// Helper hook to create a VoiceCommandProcessor instance
export function useVoiceCommandProcessor() {
  const router = useRouter();

  return new VoiceCommandProcessor(router);
}
