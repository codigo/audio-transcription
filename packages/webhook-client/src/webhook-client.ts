import PQueue from "p-queue";
import { createHmac } from "crypto";
import { fetch } from "undici";
import type {
  WebhookClientPort,
  TranscriptionJob,
} from "@codigo/audio-transcription-core";

export interface WebhookClientOptions {
  /**
   * Maximum concurrent webhook deliveries
   * @default 5
   */
  concurrency?: number;

  /**
   * Maximum retries for failed webhook deliveries
   * @default 3
   */
  maxRetries?: number;

  /**
   * Initial retry delay in milliseconds
   * @default 1000
   */
  retryDelay?: number;

  /**
   * Request timeout in milliseconds
   * @default 10000
   */
  timeout?: number;

  /**
   * Secret for signing webhook payloads (HMAC SHA-256)
   */
  signingSecret?: string;

  /**
   * Additional headers to send with webhook requests
   */
  headers?: Record<string, string>;
}

export class WebhookDeliveryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly webhookUrl: string,
    public readonly attempt: number,
    public readonly statusCode?: number,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "WebhookDeliveryError";
  }
}

const DEFAULT_OPTIONS: Required<
  Omit<WebhookClientOptions, "signingSecret" | "headers">
> = {
  concurrency: 5,
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 10000,
};

export const createWebhookClient = (
  options: WebhookClientOptions = {},
): WebhookClientPort => {
  const config = { ...DEFAULT_OPTIONS, ...options };

  const queue = new PQueue({
    concurrency: config.concurrency,
    timeout: config.timeout,
    throwOnTimeout: false,
    autoStart: true,
    intervalCap: Infinity,
    interval: 0,
    carryoverConcurrencyCount: false,
  });

  queue.on("error", (error) => {
    console.error("Queue error:", error);
  });

  const createSignature = (payload: string): string => {
    if (!config.signingSecret) return "";
    return createHmac("sha256", config.signingSecret)
      .update(payload)
      .digest("hex");
  };

  const deliverWebhook = async (
    webhookUrl: string,
    payload: object,
    attempt: number = 1,
  ): Promise<void> => {
    const stringifiedPayload = JSON.stringify(payload);
    const signature = createSignature(stringifiedPayload);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "audio-transcription-webhook/1.0",
          "x-webhook-signature": signature,
          "x-webhook-attempt": attempt.toString(),
          ...(config.headers || {}),
        },
        body: stringifiedPayload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) {
          throw new WebhookDeliveryError(
            "Rate limit exceeded",
            "RATE_LIMITED",
            webhookUrl,
            attempt,
            response.status,
          );
        }

        throw new WebhookDeliveryError(
          `HTTP ${response.status}: ${response.statusText}`,
          "DELIVERY_FAILED",
          webhookUrl,
          attempt,
          response.status,
        );
      }
    } catch (error: unknown) {
      if (
        attempt < config.maxRetries &&
        (error instanceof WebhookDeliveryError ||
          error instanceof TypeError ||
          error instanceof DOMException)
      ) {
        const delay = Math.min(
          config.retryDelay *
            Math.pow(2, attempt - 1) *
            (1 + Math.random() * 0.1),
          30000,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return deliverWebhook(webhookUrl, payload, attempt + 1);
      }

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      throw error instanceof WebhookDeliveryError
        ? error
        : new WebhookDeliveryError(
            errorMessage,
            "DELIVERY_FAILED",
            webhookUrl,
            attempt,
            undefined,
            error instanceof Error ? error : undefined,
          );
    }
  };

  const notify = async (
    webhookUrl: string,
    job: TranscriptionJob,
  ): Promise<void> => {
    const payload = {
      id: job.id,
      status: job.status,
      result: job.result,
      error: job.error,
      audioFileUrl: job.audioFileUrl,
      timestamp: new Date().toISOString(),
      eventType: "transcription.status_updated",
    };

    return queue.add(() => deliverWebhook(webhookUrl, payload), {
      priority: 0,
      timeout: config.timeout,
    });
  };

  const shutdown = async (gracePeriodMs: number = 5000): Promise<void> => {
    queue.pause();

    const timeoutPromise = new Promise((resolve) =>
      setTimeout(resolve, gracePeriodMs),
    );
    await Promise.race([queue.onIdle(), timeoutPromise]);

    queue.clear();
  };

  return {
    notify,
    shutdown,
  };
};
