interface SecurityConfig {
  phiProtectionLevel: "strict" | "moderate" | "minimal";
  enableAuditLogging: boolean;
  maxTokensPerRequest?: number;
  allowedDomains?: string[];
}

interface AuditLog {
  timestamp: Date;
  action: string;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

class AbbySecurityGuard {
  private static instance: AbbySecurityGuard;
  private auditLogs: AuditLog[] = [];
  private config: SecurityConfig;

  private constructor() {
    this.config = {
      phiProtectionLevel:
        (process.env
          .NEXT_PUBLIC_PHI_PROTECTION_LEVEL as SecurityConfig["phiProtectionLevel"]) ||
        "strict",
      enableAuditLogging:
        process.env.NEXT_PUBLIC_ENABLE_AUDIT_LOGGING === "true",
      maxTokensPerRequest: 2000,
    };
  }

  public static getInstance(): AbbySecurityGuard {
    if (!AbbySecurityGuard.instance) {
      AbbySecurityGuard.instance = new AbbySecurityGuard();
    }

    return AbbySecurityGuard.instance;
  }

  private async detectPHI(text: string): Promise<{
    containsPHI: boolean;
    detectedElements?: string[];
  }> {
    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4-turbo",
            messages: [
              {
                role: "system",
                content: `You are a PHI detection system. Analyze the following text for any Protected Health Information (PHI) as defined by HIPAA. 
              Respond with a JSON object containing:
              - containsPHI: boolean
              - detectedElements: array of strings describing found PHI elements
              Only include detectedElements if containsPHI is true.`,
              },
              {
                role: "user",
                content: text,
              },
            ],
            response_format: { type: "json_object" },
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to check for PHI");
      }

      const data = await response.json();

      return JSON.parse(data.choices[0].message.content);
    } catch (error) {
      console.error("PHI detection error:", error);

      // In case of error, be conservative and assume PHI might be present
      return { containsPHI: true };
    }
  }

  private sanitizeText(text: string): string {
    // Basic sanitization - replace potential PHI patterns
    return text
      .replace(/\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, "[REDACTED-SSN]") // SSN
      .replace(/\b\d{10}\b/g, "[REDACTED-ID]") // Medical record numbers
      .replace(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        "[REDACTED-EMAIL]",
      ) // Email
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[REDACTED-PHONE]"); // Phone
  }

  public async validateInput(text: string): Promise<{
    isValid: boolean;
    error?: string;
  }> {
    try {
      // Check for PHI if protection is enabled
      if (this.config.phiProtectionLevel !== "minimal") {
        const phiCheck = await this.detectPHI(text);

        if (phiCheck.containsPHI) {
          this.logAudit("input-validation", false, {
            error: "PHI detected",
            elements: phiCheck.detectedElements,
          });

          return {
            isValid: false,
            error: "Input contains protected health information",
          };
        }
      }

      // Token limit check
      if (
        this.config.maxTokensPerRequest &&
        text.length > this.config.maxTokensPerRequest * 4
      ) {
        return {
          isValid: false,
          error: "Input exceeds maximum allowed length",
        };
      }

      this.logAudit("input-validation", true);

      return { isValid: true };
    } catch (error) {
      this.logAudit("input-validation", false, {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  public async sanitizeOutput(text: string): Promise<string> {
    try {
      // First check for any PHI
      const phiCheck = await this.detectPHI(text);

      if (phiCheck.containsPHI) {
        // If PHI is found, apply sanitization
        const sanitized = this.sanitizeText(text);

        this.logAudit("output-sanitization", true, {
          phiDetected: true,
          sanitized: true,
        });

        return sanitized;
      }

      this.logAudit("output-sanitization", true, { phiDetected: false });

      return text;
    } catch (error) {
      this.logAudit("output-sanitization", false, {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // In case of error, apply basic sanitization
      return this.sanitizeText(text);
    }
  }

  private logAudit(
    action: string,
    success: boolean,
    metadata?: Record<string, any>,
  ): void {
    if (!this.config.enableAuditLogging) return;

    const log: AuditLog = {
      timestamp: new Date(),
      action,
      success,
      metadata,
    };

    this.auditLogs.push(log);
    console.log("[Abby Security Audit]", log);

    // Keep only last 1000 logs
    if (this.auditLogs.length > 1000) {
      this.auditLogs = this.auditLogs.slice(-1000);
    }
  }

  public getAuditLogs(): AuditLog[] {
    return [...this.auditLogs];
  }

  public updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logAudit("config-update", true, { newConfig });
  }

  public clearAuditLogs(): void {
    this.auditLogs = [];
    this.logAudit("audit-logs-cleared", true);
  }
}

// Export singleton instance
export const abbySecurityGuard = AbbySecurityGuard.getInstance();
