import t from "tap";
import { join } from "path";
import { tmpdir } from "os";
import { writeFile, mkdir } from "fs/promises";
import { MockAgent, setGlobalDispatcher } from "undici";
import { randomBytes } from "crypto";
import { promisify } from "util";

import { createTranscriptionService } from "../src/service.js";
import { createSqliteStorage } from "../../storage/src/sqlite-storage.js";
import { createWhisperClient } from "../../whisper-client/src/whisper-client.js";
import { createWebhookClient } from "../../webhook-client/src/webhook-client.js";
import { createFileDownloader } from "../../file-downloader/src/file-downloader.js";

// Constants for testing
const AUDIO_FILE_URL = "https://example.com/audio.mp3";
const WEBHOOK_URL = "https://webhook.example.com/callback";
const WHISPER_API_URL = "https://api.openai.com";
const MOCK_TRANSCRIPTION_RESULT = "Hello, this is a test transcription.";
const POLL_INTERVAL = 500;
const MAX_POLL_ATTEMPTS = 20; // Increase timeout to 10 seconds total

// Helper to create a temporary audio file
const createTempAudioFile = async (size: number = 1024): Promise<string> => {
  const dir = join(tmpdir(), "transcription-test");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `test-${randomBytes(8).toString("hex")}.mp3`);
  await writeFile(path, Buffer.alloc(size));
  return path;
};

// Add this near the top with other constants
const sleep = promisify(setTimeout);

t.test("Transcription Service Integration", async (t) => {
  let mockAgent: MockAgent;
  let dbPath: string;
  let storage: Awaited<ReturnType<typeof createSqliteStorage>>;

  t.beforeEach(async () => {
    mockAgent = new MockAgent({
      connections: 1,
      keepAliveTimeout: 10,
      keepAliveMaxTimeout: 10,
    });
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);

    dbPath = join(tmpdir(), `test-${randomBytes(8).toString("hex")}.db`);
    storage = await createSqliteStorage({
      path: dbPath,
      migrate: true,
    });
  });

  t.afterEach(async () => {
    await storage.close();
    await mockAgent.close();
  });

  await t.test("should process transcription job end-to-end", async (t) => {
    // Setup mock endpoints for this test
    const audioPool = mockAgent.get("https://example.com");
    const whisperPool = mockAgent.get(WHISPER_API_URL);
    const webhookPool = mockAgent.get("https://webhook.example.com");

    // Mock audio file download
    audioPool
      .intercept({
        path: "/audio.mp3",
        method: "GET",
      })
      .reply(200, await createTempAudioFile())
      .persist();

    // Mock Whisper API response with auth validation
    whisperPool
      .intercept({
        path: "/v1/audio/transcriptions",
        method: "POST",
        headers: (headers) => {
          return (
            headers["authorization"] === "Bearer test-api-key" &&
            headers["content-type"]?.startsWith(
              "multipart/form-data; boundary=",
            )
          );
        },
      })
      .reply(200, {
        text: MOCK_TRANSCRIPTION_RESULT,
      })
      .persist();

    // Mock webhook endpoint with logging
    webhookPool
      .intercept({
        path: "/callback",
        method: "POST",
        body: (body) => true,
      })
      .reply(
        200,
        { success: true },
        {
          headers: {
            "content-type": "application/json",
          },
        },
      )
      .persist();

    const whisperClient = createWhisperClient({
      apiKey: "test-api-key",
      maxRetries: 1,
      timeout: 5000,
    });

    const webhookClient = createWebhookClient({
      maxRetries: 1,
      timeout: 5000,
    });

    const fileDownloader = createFileDownloader({
      maxFileSize: 25 * 1024 * 1024,
      timeout: 5000,
    });

    const transcriptionService = createTranscriptionService({
      storage,
      whisperClient,
      webhookClient,
      fileDownloader,
    });

    // Create a new transcription job
    const job = await transcriptionService.createTranscriptionJob(
      AUDIO_FILE_URL,
      WEBHOOK_URL,
    );

    // Verify initial job state
    t.equal(job.status, "pending", "Job should start in pending state");
    t.equal(job.audioFileUrl, AUDIO_FILE_URL, "Should store audio URL");
    t.equal(job.webhookUrl, WEBHOOK_URL, "Should store webhook URL");

    // Wait for background processing to complete
    await transcriptionService.waitForJob(job.id);

    // Get final job state
    const completedJob = await transcriptionService.getTranscriptionJob(job.id);

    t.ok(completedJob, "Job should exist");
    t.equal(completedJob?.status, "completed", "Job should be completed");
    t.equal(
      completedJob?.result,
      MOCK_TRANSCRIPTION_RESULT,
      "Should have correct transcription result",
    );
  });

  await t.test("should handle errors gracefully", async (t) => {
    // Setup mock endpoints for this test
    const audioPool = mockAgent.get("https://example.com");
    const whisperPool = mockAgent.get(WHISPER_API_URL);

    // Mock audio file download
    audioPool
      .intercept({
        path: "/audio.mp3",
        method: "GET",
      })
      .reply(200, await createTempAudioFile())
      .persist();

    // Mock Whisper API error response with auth validation
    whisperPool
      .intercept({
        path: "/v1/audio/transcriptions",
        method: "POST",
        headers: (headers) => {
          // If no auth header or wrong key, return false to trigger 401
          if (headers["authorization"] !== "Bearer test-api-key") {
            return false;
          }
          // Otherwise check content type
          return headers["content-type"]?.startsWith(
            "multipart/form-data; boundary=",
          );
        },
      })
      .defaultReplyHeaders({
        "content-type": "application/json",
      })
      .reply(500, {
        error: {
          message: "Internal Server Error",
          type: "server_error",
        },
      })
      .persist();

    const whisperClient = createWhisperClient({
      apiKey: "test-api-key",
      maxRetries: 1,
    });

    const webhookClient = createWebhookClient({
      maxRetries: 1,
    });

    const fileDownloader = createFileDownloader({
      maxFileSize: 25 * 1024 * 1024,
      timeout: 5000,
    });

    const transcriptionService = createTranscriptionService({
      storage,
      whisperClient,
      webhookClient,
      fileDownloader,
    });

    const job =
      await transcriptionService.createTranscriptionJob(AUDIO_FILE_URL);

    // Wait for background processing with polling
    let failedJob;
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await sleep(POLL_INTERVAL);
      failedJob = await transcriptionService.getTranscriptionJob(job.id);
      if (failedJob?.status === "failed") {
        break;
      }
    }

    t.ok(failedJob, "Job should exist");
    t.equal(failedJob?.status, "failed", "Job should be marked as failed");
    t.match(
      failedJob?.error,
      /Failed to transcribe audio/,
      "Should have error message",
    );
  });
});
