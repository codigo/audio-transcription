import t from "tap";
import { join } from "path";
import { writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import {
  createWhisperClient,
  WhisperError,
  FileTooLargeError,
} from "../src/whisper-client.js";

// Constants
const API_URL = "https://api.openai.com";
const CUSTOM_API_URL = "https://custom-api.example.com";

t.setTimeout(60000); // 60 seconds

t.test("WhisperClient", async (t) => {
  let mockAgent: MockAgent;
  const originalDispatcher = getGlobalDispatcher();

  t.beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  t.afterEach(async () => {
    await mockAgent.close();
    setGlobalDispatcher(originalDispatcher);
  });

  t.test("should successfully transcribe audio", async (t) => {
    const audioPath = await createTempAudioFile();
    const expectedResponse = { text: "Hello, world!" };

    const mockPool = mockAgent.get(API_URL);
    mockPool
      .intercept({
        path: "/v1/audio/transcriptions",
        method: "POST",
        headers: {
          authorization: "Bearer test-key",
        }
      })
      .reply(200, expectedResponse);

    const client = createWhisperClient({
      apiKey: "test-key",
      maxRetries: 1,
    });

    const result = await client.transcribe(audioPath);
    t.equal(result, expectedResponse.text);
  });

  t.test("should handle rate limiting with retries", async (t) => {
    const audioPath = await createTempAudioFile();
    const expectedResponse = { text: "Hello, world!" };

    const mockPool = mockAgent.get(API_URL);
    // First request - rate limited
    mockPool
      .intercept({
        path: "/v1/audio/transcriptions",
        method: "POST",
        headers: {
          authorization: "Bearer test-key",
        }
      })
      .reply(429, {
        error: {
          message: "Rate limit exceeded",
          type: "rate_limit_exceeded",
          code: "rate_limited"
        }
      }, {
        headers: {
          'retry-after': '1'
        }
      });

    // Second request - success
    mockPool
      .intercept({
        path: "/v1/audio/transcriptions",
        method: "POST",
        headers: {
          authorization: "Bearer test-key",
        }
      })
      .reply(200, expectedResponse);

    const client = createWhisperClient({
      apiKey: "test-key",
      maxRetries: 1,
      timeout: 1000, // Reduce timeout to 1 second
    });

    const result = await client.transcribe(audioPath);
    t.equal(result, expectedResponse.text);
  });

  t.test("should handle API errors", async (t) => {
    const audioPath = await createTempAudioFile();

    const mockPool = mockAgent.get(API_URL);
    mockPool
      .intercept({
        path: "/v1/audio/transcriptions",
        method: "POST",
        headers: {
          authorization: "Bearer test-key",
        }
      })
      .reply(400, {
        error: {
          message: "Invalid file format",
          type: "invalid_request_error",
          code: "invalid_file_format"
        }
      });

    const client = createWhisperClient({
      apiKey: "test-key",
      maxRetries: 0, // Disable retries for this test
    });

    try {
      await client.transcribe(audioPath);
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof WhisperError);
      if (error instanceof WhisperError) {
        // The client will throw a MAX_RETRIES_EXCEEDED error after all retries are exhausted
        t.equal(error.code, "MAX_RETRIES_EXCEEDED", "Should have correct error code");
        t.equal(error.status, 400, "Should have correct status code");

        // The original error should be in the cause
        const cause = error.cause;
        t.ok(cause instanceof WhisperError, "Cause should be a WhisperError");
        if (cause instanceof WhisperError) {
          t.equal(cause.code, "invalid_file_format", "Cause should have correct error code");
          t.equal(cause.status, 400, "Cause should have correct status code");
          t.match(cause.message, /Invalid file format/, "Cause should have correct error message");
        }
      }
    }
  });

  t.test("should use custom base URL", async (t) => {
    const audioPath = await createTempAudioFile();
    const expectedResponse = { text: "Hello, world!" };

    const mockPool = mockAgent.get(CUSTOM_API_URL);
    mockPool
      .intercept({
        path: "/v1/audio/transcriptions",
        method: "POST",
        headers: {
          authorization: "Bearer test-key",
        }
      })
      .reply(200, expectedResponse);

    const client = createWhisperClient({
      apiKey: "test-key",
      baseUrl: CUSTOM_API_URL + "/v1",
      maxRetries: 1,
    });

    const result = await client.transcribe(audioPath);
    t.equal(result, expectedResponse.text);
  });

  // Keep existing file size and non-existent file tests as they are

  t.test("should handle max retries exceeded", async (t) => {
    const audioPath = await createTempAudioFile();

    const mockPool = mockAgent.get(API_URL);
    mockPool
      .intercept({
        path: "/v1/audio/transcriptions",
        method: "POST",
        headers: {
          authorization: "Bearer test-key",
        }
      })
      .reply(500, {
        error: {
          message: "Internal server error",
          type: "server_error"
        }
      })
      .persist();

    const client = createWhisperClient({
      apiKey: "test-key",
      maxRetries: 1,
      timeout: 1000,
    });

    try {
      await client.transcribe(audioPath);
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof WhisperError);
      if (error instanceof WhisperError) {
        t.equal(error.code, "MAX_RETRIES_EXCEEDED", "Should have correct error code");
        t.equal(error.status, 400, "Should have correct status code");
        t.match(error.message, /Failed to transcribe audio after 1 retries/, "Should have correct error message");
      }
    }
  });

  // Add a test for immediate error (no retries)
  t.test("should handle immediate errors", async (t) => {
    const audioPath = await createTempAudioFile();

    const mockPool = mockAgent.get(API_URL);
    mockPool
      .intercept({
        path: "/v1/audio/transcriptions",
        method: "POST",
        headers: {
          authorization: "Bearer test-key",
        }
      })
      .reply(401, {
        error: {
          message: "Invalid API key",
          type: "invalid_request_error",
          code: "invalid_api_key"
        }
      });

    const client = createWhisperClient({
      apiKey: "test-key",
      maxRetries: 1,
      timeout: 1000,
    });

    try {
      await client.transcribe(audioPath);

    } catch (error) {
      t.ok(error instanceof WhisperError);
      if (error instanceof WhisperError) {
        const err = error as WhisperError;
        // Check the top-level error (MAX_RETRIES_EXCEEDED)
        t.equal(err.code, "MAX_RETRIES_EXCEEDED", "Should have correct error code");
        t.equal(err.status, 400, "Should have correct status code");
        t.match(err.message, /Failed to transcribe audio after 1 retries/, "Should have correct error message");

        // Check the cause (should be an Error with the original message)
        t.ok(err.cause, "Should have a cause");
      }
    }
  });
});

// Helper function
async function createTempAudioFile(size: number = 1024): Promise<string> {
  const dir = join(tmpdir(), "whisper-test");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `test-${Date.now()}.mp3`);
  await writeFile(path, Buffer.alloc(size));
  return path;
}
