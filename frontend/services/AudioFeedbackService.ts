import { VOICE_CONFIG } from "@/config/voice";

import { abbyAnalytics } from "./AbbyAnalytics";


class AudioFeedbackService {
  private audioContext: AudioContext | null = null;
  private sounds: Map<string, AudioBuffer> = new Map();
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.initializationPromise = this.initializeAudioContext();
    }
  }

  private async initializeAudioContext() {
    if (this.isInitialized) return;

    try {
      this.audioContext = new AudioContext();
      await this.loadSounds();
      this.isInitialized = true;
      abbyAnalytics.trackEvent("audio_feedback_initialized", {});
    } catch (error) {
      console.error("Failed to initialize audio context:", error);
      abbyAnalytics.trackError(
        "audio_initialization_error",
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    }
  }

  private async loadSounds() {
    if (!this.audioContext) return;

    const soundFiles = VOICE_CONFIG.audio.sounds;
    const loadPromises: Promise<void>[] = [];

    for (const [name, path] of Object.entries(soundFiles)) {
      const loadPromise = (async () => {
        try {
          const response = await fetch(path);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer =
            await this.audioContext!.decodeAudioData(arrayBuffer);

          this.sounds.set(name, audioBuffer);
          abbyAnalytics.trackEvent("sound_loaded", { name });
        } catch (error) {
          console.error(`Failed to load sound ${name}:`, error);
          abbyAnalytics.trackError(
            "sound_load_error",
            `Failed to load ${name}: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          throw error;
        }
      })();

      loadPromises.push(loadPromise);
    }

    await Promise.all(loadPromises);
  }

  private async ensureInitialized() {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }

    if (!this.isInitialized) {
      this.initializationPromise = this.initializeAudioContext();
      await this.initializationPromise;
    }

    if (this.audioContext?.state === "suspended") {
      try {
        await this.audioContext.resume();
        abbyAnalytics.trackEvent("audio_context_resumed", {});
      } catch (error) {
        console.error("Failed to resume audio context:", error);
        abbyAnalytics.trackError(
          "audio_resume_error",
          error instanceof Error ? error.message : "Unknown error",
        );
        throw error;
      }
    }
  }

  public async playSound(name: keyof typeof VOICE_CONFIG.audio.sounds) {
    if (!VOICE_CONFIG.audio.enabled) return;

    try {
      await this.ensureInitialized();
      if (!this.audioContext) return;

      const sound = this.sounds.get(name);

      if (!sound) {
        console.warn(`Sound ${name} not found`);
        abbyAnalytics.trackError("sound_not_found", name);

        return;
      }

      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();

      source.buffer = sound;
      gainNode.gain.value = VOICE_CONFIG.audio.volume;

      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      source.start(0);
      abbyAnalytics.trackEvent("sound_played", { name });

      // Clean up after playback
      source.onended = () => {
        source.disconnect();
        gainNode.disconnect();
      };
    } catch (error) {
      console.error(`Failed to play sound ${name}:`, error);
      abbyAnalytics.trackError(
        "sound_playback_error",
        `Failed to play ${name}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw error;
    }
  }

  public async playActivation() {
    try {
      await this.playSound("activation");
    } catch (error) {
      // Fail silently but track error
      abbyAnalytics.trackError(
        "activation_sound_error",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  public async playProcessing() {
    try {
      await this.playSound("processing");
    } catch (error) {
      // Fail silently but track error
      abbyAnalytics.trackError(
        "processing_sound_error",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  public async playError() {
    try {
      await this.playSound("error");
    } catch (error) {
      // Fail silently but track error
      abbyAnalytics.trackError(
        "error_sound_error",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  public async dispose() {
    try {
      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }
      this.sounds.clear();
      this.isInitialized = false;
      this.initializationPromise = null;
      abbyAnalytics.trackEvent("audio_feedback_disposed", {});
    } catch (error) {
      console.error("Failed to dispose audio feedback:", error);
      abbyAnalytics.trackError(
        "audio_dispose_error",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }
}

// Create a singleton instance
export const audioFeedback = new AudioFeedbackService();
