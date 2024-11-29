import t from "tap";
import { MockAgent, setGlobalDispatcher } from "undici";
import {
  createWebhookClient,
  WebhookDeliveryError,
} from "../src/webhook-client.js";
import type { TranscriptionJob } from "@codigo/audio-transcription-core";

const BASE_URL = "https://webhook.test";

// Mock job data for testing
const mockJob: TranscriptionJob = {
  id: "123",
  status: "completed",
  audioFileUrl: "https://example.com/audio.mp3",
  result: "Transcription result",
  createdAt: new Date("2023-01-01T00:00:00Z"),
  updatedAt: new Date("2023-01-01T00:01:00Z"),
};

await t.test("WebhookClient", async (t) => {
  // Setup mock agent
  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect(); // Ensure no real network requests are made
  setGlobalDispatcher(mockAgent);

  // Create mock pool for our test URL
  const mockPool = mockAgent.get(BASE_URL);

  await t.test(
    "should successfully deliver webhook with correct payload",
    async (t) => {
      let capturedPayload: any;
      let capturedHeaders: Record<string, string> = {};

      // Setup mock endpoint
      mockPool
        .intercept({
          path: "/webhook",
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "audio-transcription-webhook/1.0",
          },
        })
        .reply(200, (opts) => {
          capturedPayload = JSON.parse(opts.body as string);
          // Capture headers from the intercepted request
          if (opts.headers instanceof Headers) {
            for (const [key, value] of opts.headers.entries()) {
              capturedHeaders[key.toLowerCase()] = value;
            }
          } else {
            // Handle headers if they come as a plain object
            capturedHeaders = Object.fromEntries(
              Object.entries(opts.headers as Record<string, string>).map(
                ([k, v]) => [k.toLowerCase(), v],
              ),
            );
          }
          return { success: true };
        });

      // Create client and send webhook
      const client = createWebhookClient();
      await client.notify(`${BASE_URL}/webhook`, mockJob);

      // Verify the payload
      t.equal(capturedPayload.id, mockJob.id, "should send correct job ID");
      t.equal(
        capturedPayload.status,
        mockJob.status,
        "should send correct status",
      );
      t.equal(
        capturedPayload.result,
        mockJob.result,
        "should send correct result",
      );
      t.equal(
        capturedPayload.audioFileUrl,
        mockJob.audioFileUrl,
        "should send correct audio URL",
      );
      t.equal(
        capturedPayload.eventType,
        "transcription.status_updated",
        "should include event type",
      );
      t.ok(capturedPayload.timestamp, "should include timestamp");

      // Verify headers
      t.equal(
        capturedHeaders["content-type"],
        "application/json",
        "should set content-type header",
      );
      t.equal(
        capturedHeaders["user-agent"],
        "audio-transcription-webhook/1.0",
        "should set user-agent header",
      );
    },
  );

  await t.test("should handle rate limiting response", async (t) => {
    // Setup mock endpoint with rate limit response
    mockPool
      .intercept({
        path: "/webhook",
        method: "POST",
      })
      .reply(
        429,
        { error: "Too Many Requests" },
        {
          headers: {
            "retry-after": "60",
          },
        },
      );

    // Create client and attempt to send webhook
    const client = createWebhookClient({ maxRetries: 1 });

    try {
      await client.notify(`${BASE_URL}/webhook`, mockJob);
      t.fail("should have thrown an error");
    } catch (error) {
      t.ok(
        error instanceof WebhookDeliveryError,
        "should throw WebhookDeliveryError",
      );
      t.equal(error.code, "RATE_LIMITED", "should have correct error code");
      t.equal(error.statusCode, 429, "should have correct status code");
      t.equal(error.attempt, 1, "should have correct attempt number");
      t.match(
        error.message,
        /Rate limit exceeded/,
        "should have correct error message",
      );
    }
  });

  await t.test(
    "should retry on server error and eventually succeed",
    async (t) => {
      let attemptCount = 0;

      // Single interceptor that handles all attempts
      mockPool
        .intercept({
          path: "/webhook",
          method: "POST",
        })
        .reply(() => {
          attemptCount++;

          if (attemptCount < 3) {
            return {
              statusCode: 500,
              error: "Internal Server Error",
            };
          }

          return {
            statusCode: 200,
            success: true,
          };
        })
        .persist(); // Allow multiple matches

      // Create client with quick retry delay for faster tests
      const client = createWebhookClient({
        maxRetries: 3,
        retryDelay: 100,
      });

      // Should eventually succeed after retries
      await client.notify(`${BASE_URL}/webhook`, mockJob);

      t.equal(attemptCount, 3, "should have attempted 3 times");
    },
  );

  await t.test(
    "should handle network errors and wrap them properly",
    async (t) => {
      // Setup mock endpoint that simulates a network error
      mockPool
        .intercept({
          path: "/webhook",
          method: "POST",
        })
        .replyWithError(new Error("Connection reset by peer"))
        .persist();

      // Create client with only 1 retry to speed up test
      const client = createWebhookClient({
        maxRetries: 1,
        retryDelay: 100,
      });

      try {
        await client.notify(`${BASE_URL}/webhook`, mockJob);
      } catch (error) {
        t.ok(
          error instanceof WebhookDeliveryError,
          "should wrap error in WebhookDeliveryError",
        );
        t.equal(
          error.code,
          "DELIVERY_FAILED",
          "should have correct error code",
        );
        t.equal(error.attempt, 2, "should have attempted twice");
        t.match(
          error.message,
          /Connection reset by peer/,
          "should preserve original error message",
        );
        t.ok(
          error.cause instanceof Error,
          "should preserve original error as cause",
        );
      }
    },
  );

  await t.test("should handle timeout errors properly", async (t) => {
    // Setup mock endpoint that simulates a timeout
    mockPool
      .intercept({
        path: "/webhook",
        method: "POST",
      })
      .reply(() => {
        // Delay longer than the timeout
        return { statusCode: 200 };
      })
      .delay(200)
      .persist();

    const client = createWebhookClient({
      maxRetries: 1,
      retryDelay: 100,
      timeout: 100, // Short timeout to trigger the error
    });

    try {
      await client.notify(`${BASE_URL}/webhook`, mockJob);
    } catch (error) {
      t.ok(
        error instanceof WebhookDeliveryError,
        "should wrap timeout error in WebhookDeliveryError",
      );
      t.equal(error.code, "DELIVERY_FAILED", "should have correct error code");
      t.match(
        error.message,
        /abort/i,
        "should include abort in the error message",
      );
      t.equal(error.attempt, 2, "should have attempted twice");
      t.ok(
        error.cause instanceof DOMException,
        "should have DOMException as cause",
      );
    }
  });

  t.teardown(async () => {
    await mockAgent.close();
  });
});
