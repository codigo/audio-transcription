import { createReadStream } from "fs";
import { stat } from "fs/promises";
import fetch from "node-fetch";
import FormData from "form-data";
import retry from "retry";
import type { WhisperClientPort } from "@codigo/audio-transcription-core";

export interface WhisperClientOptions {
  apiKey: string;
  /**
   * Base URL for OpenAI API
   * @default "https://api.openai.com/v1"
   */
  baseUrl?: string;
  /**
   * Maximum retries for failed requests
   * @default 3
   */
  maxRetries?: number;
  /**
   * Maximum file size in bytes (OpenAI limit is 25MB)
   * @default 25 * 1024 * 1024
   */
  maxFileSize?: number;
  /**
   * Timeout for requests in milliseconds
   * @default 30000
   */
  timeout?: number;
}

export class WhisperError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "WhisperError";
  }
}

export class FileTooLargeError extends WhisperError {
  constructor(size: number, maxSize: number) {
    super(
      `File size ${size} bytes exceeds maximum size of ${maxSize} bytes`,
      "FILE_TOO_LARGE",
    );
    this.name = "FileTooLargeError";
  }
}

const DEFAULT_OPTIONS: Required<Omit<WhisperClientOptions, "apiKey">> = {
  baseUrl: "https://api.openai.com/v1",
  maxRetries: 3,
  maxFileSize: 25 * 1024 * 1024, // 25MB
  timeout: 30000,
};

export const createWhisperClient = (
  options: WhisperClientOptions,
): WhisperClientPort => {
  const config = { ...DEFAULT_OPTIONS, ...options };

  const transcribe = async (audioFilePath: string): Promise<string> => {
    // Check file size
    try {
      const stats = await stat(audioFilePath);
      if (stats.size > config.maxFileSize) {
        throw new FileTooLargeError(stats.size, config.maxFileSize);
      }
    } catch (error) {
      if (error instanceof FileTooLargeError) throw error;
      throw new WhisperError(
        `Failed to read audio file: ${(error as Error).message}`,
        "FILE_READ_ERROR",
        undefined,
        error as Error,
      );
    }

    // Create retry operation
    const operation = retry.operation({
      retries: config.maxRetries,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 5000,
      randomize: true,
    });

    return new Promise((resolve, reject) => {
      operation.attempt(async (currentAttempt) => {
        try {
          const form = new FormData();
          form.append("file", createReadStream(audioFilePath));
          form.append("model", "whisper-1");

          const controller = new AbortController();
          const timeoutId = setTimeout(
            () => controller.abort(),
            config.timeout,
          );

          const response = await fetch(
            `${config.baseUrl}/audio/transcriptions`,
            {
              method: "POST",
              body: form,
              headers: {
                Authorization: `Bearer ${config.apiKey}`,
                ...form.getHeaders(),
              },
              signal: controller.signal,
            },
          );

          clearTimeout(timeoutId);

          if (!response.ok) {
            const error = await response.json().catch(() => ({}));

            // Add type guard
            type APIError = { error?: { message: string; code: string } };
            const isAPIError = (err: unknown): err is APIError =>
              typeof err === "object" && err !== null && "error" in err;

            // Handle rate limiting
            if (response.status === 429) {
              const retryAfter = parseInt(
                response.headers.get("retry-after") || "60",
                10,
              );
              throw new WhisperError(
                "Rate limit exceeded",
                "RATE_LIMIT_EXCEEDED",
                response.status,
              );
            }

            const errorMessage = isAPIError(error)
              ? error.error?.message
              : undefined;
            const errorCode = isAPIError(error) ? error.error?.code : undefined;

            throw new WhisperError(
              errorMessage || `HTTP error ${response.status}`,
              errorCode || "API_ERROR",
              response.status,
            );
          }

          const result = await response.json();
          // Add type guard for response
          type WhisperResponse = { text: string };
          if (!result || typeof result !== "object" || !("text" in result)) {
            throw new WhisperError(
              "Invalid API response format",
              "INVALID_RESPONSE",
              response.status,
            );
          }
          resolve((result as WhisperResponse).text);
        } catch (error) {
          // Don't retry certain errors
          if (
            error instanceof FileTooLargeError ||
            (error instanceof Error &&
              "code" in error &&
              (error.code === "ENOENT" || error.code === "EACCES"))
          ) {
            reject(error);
            return;
          }

          if (operation.retry(error as Error)) {
            console.warn(
              `Whisper API request failed (attempt ${currentAttempt}/${config.maxRetries + 1}):`,
              error instanceof Error ? error.message : String(error),
            );
            return;
          }

          reject(
            new WhisperError(
              `Failed to transcribe audio after ${config.maxRetries} retries`,
              "MAX_RETRIES_EXCEEDED",
              400,
              error instanceof Error ? error : new Error(String(error)),
            ),
          );
        }
      });
    });
  };

  return { transcribe };
};
