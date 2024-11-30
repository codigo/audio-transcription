import t from "tap";
import { randomUUID } from "node:crypto";
import {
  TranscriptionJob,
  StoragePort,
  WhisperClientPort,
  WebhookClientPort,
  FileDownloaderPort,
} from "../src/types.ts";
import { createTranscriptionService } from "../src/service.ts";

// Mock implementations
const createMockStorage = (): StoragePort => {
  const jobs = new Map<string, TranscriptionJob>();

  return {
    createJob: async (job): Promise<TranscriptionJob> => {
      const newJob = {
        ...job,
        id: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jobs.set(newJob.id, newJob);
      return newJob;
    },
    updateJob: async (id, update): Promise<TranscriptionJob> => {
      const job = jobs.get(id);
      if (!job) throw new Error("Job not found");

      const updatedJob = {
        ...job,
        ...update,
        updatedAt: new Date(),
      };
      jobs.set(id, updatedJob);
      return updatedJob;
    },
    getJob: async (id): Promise<TranscriptionJob | null> => {
      return jobs.get(id) ?? null;
    },
    close: async (): Promise<void> => {
      // No-op
    },
  };
};

const createMockWhisperClient = (): WhisperClientPort => ({
  transcribe: async () => "Mocked transcription result",
});

const createMockWebhookClient = (): WebhookClientPort & {
  calls: TranscriptionJob[];
} => {
  const calls: TranscriptionJob[] = [];
  return {
    calls,
    notify: async (webhookUrl, job): Promise<void> => {
      calls.push(job);
    },
    shutdown: async (): Promise<void> => {
      // No-op
    },
  };
};

const createMockFileDownloader = (): FileDownloaderPort & {
  downloads: string[];
} => {
  const downloads: string[] = [];
  return {
    downloads,
    downloadFile: async (url): Promise<void> => {
      downloads.push(url);
    },
  };
};

t.test("TranscriptionService", async (t) => {
  t.test("createTranscriptionJob should create a pending job", async (t) => {
    const storage = createMockStorage();
    const whisperClient = createMockWhisperClient();
    const webhookClient = createMockWebhookClient();
    const fileDownloader = createMockFileDownloader();

    const service = createTranscriptionService({
      storage,
      whisperClient,
      webhookClient,
      fileDownloader,
    });

    const audioFileUrl = "https://example.com/audio.mp3";
    const webhookUrl = "https://example.com/webhook";

    const job = await service.createTranscriptionJob(audioFileUrl, webhookUrl);

    t.equal(job.status, "pending");
    t.equal(job.audioFileUrl, audioFileUrl);
    t.equal(job.webhookUrl, webhookUrl);
    t.ok(job.id);
    t.ok(job.createdAt);
    t.ok(job.updatedAt);

    // Wait for background processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    const processedJob = await service.getTranscriptionJob(job.id);
    t.ok(processedJob);
    t.equal(processedJob?.status, "completed");
    t.equal(processedJob?.result, "Mocked transcription result");
    t.equal(fileDownloader.downloads[0], audioFileUrl);
    t.equal(webhookClient.calls.length, 1);
    t.equal(webhookClient.calls[0].id, job.id);
  });

  t.test("should handle errors during transcription", async (t) => {
    const storage = createMockStorage();
    const webhookClient = createMockWebhookClient();
    const fileDownloader = createMockFileDownloader();

    // Create failing whisper client
    const whisperClient: WhisperClientPort = {
      transcribe: async () => {
        throw new Error("Transcription failed");
      },
    };

    const service = createTranscriptionService({
      storage,
      whisperClient,
      webhookClient,
      fileDownloader,
    });

    const job = await service.createTranscriptionJob(
      "https://example.com/audio.mp3",
    );

    // Wait for background processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    const failedJob = await service.getTranscriptionJob(job.id);
    t.ok(failedJob);
    t.equal(failedJob?.status, "failed");
    t.equal(failedJob?.error, "Transcription failed");
    t.equal(webhookClient.calls.length, 0);
  });

  t.test(
    "getTranscriptionJob should return null for non-existent job",
    async (t) => {
      const storage = createMockStorage();
      const whisperClient = createMockWhisperClient();
      const webhookClient = createMockWebhookClient();
      const fileDownloader = createMockFileDownloader();

      const service = createTranscriptionService({
        storage,
        whisperClient,
        webhookClient,
        fileDownloader,
      });

      const job = await service.getTranscriptionJob("non-existent-id");
      t.equal(job, null);
    },
  );
});
