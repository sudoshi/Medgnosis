interface AnalyticsEvent {
  type: string;
  timestamp: Date;
  data: Record<string, any>;
  userId?: string;
  sessionId: string;
}

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface ErrorEvent {
  type: string;
  message: string;
  timestamp: Date;
  stack?: string;
  metadata?: Record<string, any>;
}

interface VoiceMetrics {
  totalCommands: number;
  successfulCommands: number;
  failedCommands: number;
  averageResponseTime: number;
  wakeWordDetections: number;
  voiceSynthesisDuration: number;
}

class AbbyAnalytics {
  private static instance: AbbyAnalytics;
  private events: AnalyticsEvent[] = [];
  private metrics: PerformanceMetric[] = [];
  private errors: ErrorEvent[] = [];
  private sessionId: string;
  private userId?: string;
  private voiceMetrics: VoiceMetrics = {
    totalCommands: 0,
    successfulCommands: 0,
    failedCommands: 0,
    averageResponseTime: 0,
    wakeWordDetections: 0,
    voiceSynthesisDuration: 0,
  };

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.startSession();
  }

  public static getInstance(): AbbyAnalytics {
    if (!AbbyAnalytics.instance) {
      AbbyAnalytics.instance = new AbbyAnalytics();
    }

    return AbbyAnalytics.instance;
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  private startSession(): void {
    this.trackEvent("session_start", {
      userAgent:
        typeof window !== "undefined" ? window.navigator.userAgent : "unknown",
      timestamp: new Date(),
    });

    // Set up performance monitoring
    if (typeof window !== "undefined") {
      // Monitor memory usage
      if ("memory" in window.performance) {
        setInterval(() => {
          this.trackPerformanceMetric(
            "memory_usage",
            (performance as any).memory.usedJSHeapSize,
          );
        }, 60000); // Every minute
      }

      // Monitor response times
      this.observeResponseTimes();
    }
  }

  private observeResponseTimes(): void {
    if (typeof window !== "undefined" && "PerformanceObserver" in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === "measure" && entry.name.startsWith("abby_")) {
            this.trackPerformanceMetric("response_time", entry.duration, {
              operation: entry.name,
            });

            // Update voice metrics if it's a voice-related operation
            if (entry.name.startsWith("abby_voice_")) {
              this.updateVoiceResponseTime(entry.duration);
            }
          }
        }
      });

      observer.observe({ entryTypes: ["measure"] });
    }
  }

  private updateVoiceResponseTime(duration: number): void {
    const currentTotal =
      this.voiceMetrics.averageResponseTime * this.voiceMetrics.totalCommands;

    this.voiceMetrics.totalCommands++;
    this.voiceMetrics.averageResponseTime =
      (currentTotal + duration) / this.voiceMetrics.totalCommands;
  }

  public trackVoiceCommand(success: boolean, duration: number): void {
    this.voiceMetrics.totalCommands++;
    if (success) {
      this.voiceMetrics.successfulCommands++;
    } else {
      this.voiceMetrics.failedCommands++;
    }
    this.updateVoiceResponseTime(duration);
  }

  public trackWakeWordDetection(): void {
    this.voiceMetrics.wakeWordDetections++;
    this.trackEvent("wake_word_detected", {
      totalDetections: this.voiceMetrics.wakeWordDetections,
    });
  }

  public trackVoiceSynthesis(duration: number): void {
    this.voiceMetrics.voiceSynthesisDuration += duration;
    this.trackEvent("voice_synthesis", {
      duration,
      totalDuration: this.voiceMetrics.voiceSynthesisDuration,
    });
  }

  public setUserId(userId: string): void {
    this.userId = userId;
    this.trackEvent("user_identified", { userId });
  }

  public trackEvent(type: string, data: Record<string, any>): void {
    const event: AnalyticsEvent = {
      type,
      timestamp: new Date(),
      data,
      userId: this.userId,
      sessionId: this.sessionId,
    };

    this.events.push(event);
    this.pruneEvents();

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.log("[Abby Analytics]", event);
    }
  }

  public trackPerformanceMetric(
    name: string,
    value: number,
    metadata?: Record<string, any>,
  ): void {
    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: new Date(),
      metadata,
    };

    this.metrics.push(metric);
    this.pruneMetrics();
  }

  public trackError(
    type: string,
    error: Error | string,
    metadata?: Record<string, any>,
  ): void {
    const errorEvent: ErrorEvent = {
      type,
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date(),
      metadata,
    };

    this.errors.push(errorEvent);
    this.pruneErrors();

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("[Abby Error]", errorEvent);
    }
  }

  private pruneEvents(): void {
    // Keep last 1000 events
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
  }

  private pruneMetrics(): void {
    // Keep last 1000 metrics
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  private pruneErrors(): void {
    // Keep last 100 errors
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }
  }

  public getEvents(options?: {
    type?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): AnalyticsEvent[] {
    let filtered = this.events;

    if (options?.type) {
      filtered = filtered.filter((e) => e.type === options.type);
    }

    if (options?.startTime) {
      filtered = filtered.filter((e) => e.timestamp >= options.startTime!);
    }

    if (options?.endTime) {
      filtered = filtered.filter((e) => e.timestamp <= options.endTime!);
    }

    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  public getMetrics(options?: {
    name?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): PerformanceMetric[] {
    let filtered = this.metrics;

    if (options?.name) {
      filtered = filtered.filter((m) => m.name === options.name);
    }

    if (options?.startTime) {
      filtered = filtered.filter((m) => m.timestamp >= options.startTime!);
    }

    if (options?.endTime) {
      filtered = filtered.filter((m) => m.timestamp <= options.endTime!);
    }

    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  public getErrors(options?: {
    type?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): ErrorEvent[] {
    let filtered = this.errors;

    if (options?.type) {
      filtered = filtered.filter((e) => e.type === options.type);
    }

    if (options?.startTime) {
      filtered = filtered.filter((e) => e.timestamp >= options.startTime!);
    }

    if (options?.endTime) {
      filtered = filtered.filter((e) => e.timestamp <= options.endTime!);
    }

    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  public getVoiceMetrics(): VoiceMetrics {
    return { ...this.voiceMetrics };
  }

  public getStats(): {
    totalEvents: number;
    totalMetrics: number;
    totalErrors: number;
    sessionDuration: number;
    eventsPerMinute: number;
    voiceMetrics: VoiceMetrics;
  } {
    const now = new Date();
    const sessionStart = this.events[0]?.timestamp || now;
    const sessionDuration = now.getTime() - sessionStart.getTime();
    const eventsPerMinute =
      (this.events.length / sessionDuration) * 60 * 1000 || 0;

    return {
      totalEvents: this.events.length,
      totalMetrics: this.metrics.length,
      totalErrors: this.errors.length,
      sessionDuration,
      eventsPerMinute,
      voiceMetrics: this.getVoiceMetrics(),
    };
  }

  public clearData(): void {
    this.events = [];
    this.metrics = [];
    this.errors = [];
    this.sessionId = this.generateSessionId();
    this.voiceMetrics = {
      totalCommands: 0,
      successfulCommands: 0,
      failedCommands: 0,
      averageResponseTime: 0,
      wakeWordDetections: 0,
      voiceSynthesisDuration: 0,
    };
  }
}

// Export singleton instance
export const abbyAnalytics = AbbyAnalytics.getInstance();
