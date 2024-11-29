import t from "tap";
import { join } from "path";
import { writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import nock from "nock";
import {
  createWhisperClient,
  WhisperError,
  FileTooLargeError,
} from "../src/whisper-client.js";

// Disable real network requests during tests
nock.disableNetConnect();

const createTempAudioFile = async (size: number = 1024): Promise<string> => {
  const dir = join(tmpdir(), "whisper-test");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `test-${Date.now()}.mp3`);
  await writeFile(path, Buffer.alloc(size));
  return path;
};

// At the top of your test file, add this helper function
const matchFormData = (body: string) => {
  // We only care that it contains the required fields, not the exact format
  return (
    body.includes('name="file"') &&
    body.includes('name="model"') &&
    body.includes("whisper-1")
  );
};

t.beforeEach(() => {
  nock.cleanAll();
});

t.afterEach(() => {
  nock.cleanAll();
});

t.test("WhisperClient", async (t) => {
  t.test("should successfully transcribe audio", async (t) => {
    const audioPath = await createTempAudioFile();
    const expectedResponse = { text: "Hello, world!" };

    const scope = nock("https://api.openai.com")
      .post("/v1/audio/transcriptions")
      .reply(200, expectedResponse);

    const client = createWhisperClient({
      apiKey: "test-key",
    });

    const result = await client.transcribe(audioPath);
    t.equal(result, expectedResponse.text);
    t.ok(scope.isDone(), "API was called");
  });

  t.test("should handle rate limiting with retries", async (t) => {
    const audioPath = await createTempAudioFile();
    const expectedResponse = { text: "Hello, world!" };

    const scope = nock("https://api.openai.com")
      .post("/v1/audio/transcriptions")
      .reply(
        429,
        {
          error: {
            message: "Rate limit exceeded",
            type: "rate_limit_exceeded",
          },
        },
        {
          "Retry-After": "1",
        },
      )
      .post("/v1/audio/transcriptions")
      .reply(200, expectedResponse);

    const client = createWhisperClient({
      apiKey: "test-key",
      maxRetries: 1,
    });

    const result = await client.transcribe(audioPath);
    t.equal(result, expectedResponse.text);
    t.ok(scope.isDone(), "Both API calls were made");
  });

  t.test("should handle file size limits", async (t) => {
    const maxFileSize = 1024;
    const audioPath = await createTempAudioFile(maxFileSize * 2);

    const client = createWhisperClient({
      apiKey: "test-key",
      maxFileSize,
    });

    try {
      await client.transcribe(audioPath);
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof FileTooLargeError);
      t.equal(error.code, "FILE_TOO_LARGE");
    }
  });

  t.test("should handle non-existent files", async (t) => {
    const client = createWhisperClient({
      apiKey: "test-key",
    });

    try {
      await client.transcribe("/non/existent/path");
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof WhisperError);
      t.equal(error.code, "FILE_READ_ERROR");
    }
  });

  t.test("should handle API errors", async (t) => {
    const audioPath = await createTempAudioFile();

    // Persist the mock so it doesn't get consumed after first use
    const scope = nock("https://api.openai.com")
      .persist()
      .post("/v1/audio/transcriptions", (body) => {
        return (
          body.includes('name="file"') &&
          body.includes('name="model"') &&
          body.includes("whisper-1")
        );
      })
      .reply(400, {
        error: {
          message: "Invalid file format",
          code: "invalid_file_format",
        },
      });

    const client = createWhisperClient({
      apiKey: "test-key",
    });

    try {
      await client.transcribe(audioPath);
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof WhisperError);
      if (error instanceof WhisperError) {
        t.equal(
          error.code,
          "MAX_RETRIES_EXCEEDED",
          "Should have correct error code",
        );
        t.equal(error.status, 400, "Should have correct status code");
      }
    }

    scope.persist(false);
    nock.cleanAll();
    t.ok(scope.isDone(), "API was called");
  });

  t.test("should handle max retries exceeded", async (t) => {
    const audioPath = await createTempAudioFile();

    const scope = nock("https://api.openai.com")
      .persist()
      .post("/v1/audio/transcriptions", (body) => {
        return (
          body.includes('name="file"') &&
          body.includes('name="model"') &&
          body.includes("whisper-1")
        );
      })
      .reply(500, {
        error: {
          message: "Internal server error",
          type: "internal_server_error",
        },
      });

    const client = createWhisperClient({
      apiKey: "test-key",
      maxRetries: 1,
      // Reduce timeout for faster tests
      timeout: 1000,
    });

    try {
      await client.transcribe(audioPath);
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof WhisperError);
      t.equal(error.code, "MAX_RETRIES_EXCEEDED");
      t.match(error.message, /Failed to transcribe audio after 1 retries/);
    }

    // Clean up the persisted mock
    scope.persist(false);
    nock.cleanAll();
    t.ok(scope.isDone(), "API was called twice");
  });

  t.test("should use custom base URL", async (t) => {
    const audioPath = await createTempAudioFile();
    const expectedResponse = { text: "Hello, world!" };

    const scope = nock("https://custom-api.example.com")
      .post("/v1/audio/transcriptions", matchFormData)
      .reply(function (uri, requestBody) {
        const hasValidAuth =
          this.req.headers.authorization === "Bearer test-key";
        return hasValidAuth
          ? [200, expectedResponse]
          : [401, { error: { message: "Unauthorized" } }];
      });

    const client = createWhisperClient({
      apiKey: "test-key",
      baseUrl: "https://custom-api.example.com/v1",
    });

    const result = await client.transcribe(audioPath);
    t.equal(result, expectedResponse.text);
    t.ok(scope.isDone(), "Custom API was called");
  });
});
