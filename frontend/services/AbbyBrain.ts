import { abbyAnalytics } from "./AbbyAnalytics";
import { abbyCache } from "./AbbyCache";
import { abbySecurityGuard } from "./AbbySecurityGuard";

interface BrainOptions {
  context?: Record<string, any>;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

interface BrainResponse {
  text: string;
  tokens: number;
  cached: boolean;
}

class AbbyBrain {
  private static instance: AbbyBrain;
  private anthropicKey: string;
  private openAIKey: string;
  private openRouterKey: string;

  private constructor() {
    this.anthropicKey = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "";
    this.openAIKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || "";
    this.openRouterKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || "";
  }

  public static getInstance(): AbbyBrain {
    if (!AbbyBrain.instance) {
      AbbyBrain.instance = new AbbyBrain();
    }

    return AbbyBrain.instance;
  }

  private async callAnthropicAPI(
    prompt: string,
    options: BrainOptions = {},
  ): Promise<string> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-2",
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.7,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        system: `You are Abby, an AI healthcare assistant. You help doctors with their daily tasks and provide insights about patient care. You are knowledgeable about medical terminology, procedures, and best practices. You are professional, empathetic, and focused on improving patient outcomes. You must protect patient privacy and never disclose PHI inappropriately. Context: ${
          JSON.stringify(options.context) || "{}"
        }`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${await response.text()}`);
    }

    const data = await response.json();

    return data.content[0].text;
  }

  private async callOpenAIAPI(
    prompt: string,
    options: BrainOptions = {},
  ): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.openAIKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are Abby, an AI healthcare assistant. You help doctors with their daily tasks and provide insights about patient care. You are knowledgeable about medical terminology, procedures, and best practices. You are professional, empathetic, and focused on improving patient outcomes. You must protect patient privacy and never disclose PHI inappropriately. Context: ${
              JSON.stringify(options.context) || "{}"
            }`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.7,
        stream: options.stream || false,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${await response.text()}`);
    }

    const data = await response.json();

    return data.choices[0].message.content;
  }

  private async callOpenRouterAPI(
    prompt: string,
    options: BrainOptions = {},
  ): Promise<string> {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.openRouterKey}`,
          "HTTP-Referer": "https://github.com/population-health-platform",
        },
        body: JSON.stringify({
          model: "anthropic/claude-2",
          messages: [
            {
              role: "system",
              content: `You are Abby, an AI healthcare assistant. You help doctors with their daily tasks and provide insights about patient care. You are knowledgeable about medical terminology, procedures, and best practices. You are professional, empathetic, and focused on improving patient outcomes. You must protect patient privacy and never disclose PHI inappropriately. Context: ${
                JSON.stringify(options.context) || "{}"
              }`,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: options.maxTokens || 2000,
          temperature: options.temperature || 0.7,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${await response.text()}`);
    }

    const data = await response.json();

    return data.choices[0].message.content;
  }

  public async think(
    input: string,
    options: BrainOptions = {},
  ): Promise<BrainResponse> {
    const startTime = performance.now();

    try {
      // Check security first
      const inputValidation = await abbySecurityGuard.validateInput(input);

      if (!inputValidation.isValid) {
        throw new Error(inputValidation.error || "Invalid input");
      }

      // Check cache
      const cached = abbyCache.getAIResponse(input);

      if (cached) {
        abbyAnalytics.trackEvent("brain_cache_hit", {
          inputLength: input.length,
          context: options.context,
        });

        return {
          text: cached,
          tokens: 0, // We don't store token count in cache
          cached: true,
        };
      }

      // Try different APIs in order
      let response: string;

      try {
        response = await this.callAnthropicAPI(input, options);
      } catch (error) {
        console.warn("Anthropic API failed, falling back to OpenAI:", error);
        try {
          response = await this.callOpenAIAPI(input, options);
        } catch (error) {
          console.warn("OpenAI API failed, falling back to OpenRouter:", error);
          response = await this.callOpenRouterAPI(input, options);
        }
      }

      // Sanitize output
      response = await abbySecurityGuard.sanitizeOutput(response);

      // Cache the response
      abbyCache.setAIResponse(input, response);

      // Track performance
      const duration = performance.now() - startTime;

      abbyAnalytics.trackEvent("brain_response", {
        inputLength: input.length,
        outputLength: response.length,
        duration,
        context: options.context,
      });

      return {
        text: response,
        tokens: response.split(/\s+/).length, // Rough estimate
        cached: false,
      };
    } catch (error) {
      console.error("Brain error:", error);
      abbyAnalytics.trackError(
        "brain_error",
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    }
  }

  public async streamThought(
    input: string,
    onToken: (token: string) => void,
    options: BrainOptions = {},
  ): Promise<void> {
    try {
      // Check security
      const inputValidation = await abbySecurityGuard.validateInput(input);

      if (!inputValidation.isValid) {
        throw new Error(inputValidation.error || "Invalid input");
      }

      // Stream response from OpenAI (they have the best streaming support)
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.openAIKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: `You are Abby, an AI healthcare assistant. You help doctors with their daily tasks and provide insights about patient care. You are knowledgeable about medical terminology, procedures, and best practices. You are professional, empathetic, and focused on improving patient outcomes. You must protect patient privacy and never disclose PHI inappropriately. Context: ${
                  JSON.stringify(options.context) || "{}"
                }`,
              },
              {
                role: "user",
                content: input,
              },
            ],
            max_tokens: options.maxTokens || 2000,
            temperature: options.temperature || 0.7,
            stream: true,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${await response.text()}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value);
        const lines = buffer.split("\n");

        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);

            if (data === "[DONE]") continue;

            try {
              const json = JSON.parse(data);
              const token = json.choices[0]?.delta?.content;

              if (token) {
                // Sanitize each token
                const sanitizedToken =
                  await abbySecurityGuard.sanitizeOutput(token);

                onToken(sanitizedToken);
              }
            } catch (error) {
              console.warn("Failed to parse streaming response:", error);
            }
          }
        }
      }
    } catch (error) {
      console.error("Streaming error:", error);
      abbyAnalytics.trackError(
        "stream_error",
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    }
  }
}

// Export singleton instance
export const abbyBrain = AbbyBrain.getInstance();
