import { randomUUID } from "node:crypto";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import {
  TranscriptionService,
  TranscriptionServiceDependencies,
  TranscriptionJob,
} from "./types";

const createTempDir = async (): Promise<string> => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "transcription-"));
  return tempDir;
};

const cleanupTempDir = async (dirPath: string): Promise<void> => {
  await fs.rm(dirPath, { recursive: true, force: true });
};

export const createTranscriptionService = (
  deps: TranscriptionServiceDependencies,
): TranscriptionService => {
  const processTranscription = async (job: TranscriptionJob): Promise<void> => {
    try {
      const tempDir = await createTempDir();
      const audioFilePath = path.join(tempDir, `${randomUUID()}.audio`);

      try {
        // Update job status to processing
        await deps.storage.updateJob(job.id, { status: "processing" });

        // Download the file
        await deps.fileDownloader.downloadFile(job.audioFileUrl, audioFilePath);

        // Get transcription from Whisper
        const result = await deps.whisperClient.transcribe(audioFilePath);

        // Update job with result
        const updatedJob = await deps.storage.updateJob(job.id, {
          status: "completed",
          result,
        });

        // Send webhook if URL was provided
        if (updatedJob.webhookUrl) {
          await deps.webhookClient.notify(updatedJob.webhookUrl, updatedJob);
        }
      } finally {
        await cleanupTempDir(tempDir);
      }
    } catch (error) {
      // Update job with error
      await deps.storage.updateJob(job.id, {
        status: "failed",
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  };

  const createTranscriptionJob = async (
    audioFileUrl: string,
    webhookUrl?: string,
  ): Promise<TranscriptionJob> => {
    const job = await deps.storage.createJob({
      status: "pending",
      audioFileUrl,
      webhookUrl,
    });

    // Process transcription in the background
    processTranscription(job).catch((error) => {
      console.error("Background processing failed:", error);
    });

    return job;
  };

  const getTranscriptionJob = async (
    jobId: string,
  ): Promise<TranscriptionJob | null> => {
    return deps.storage.getJob(jobId);
  };

  return {
    createTranscriptionJob,
    getTranscriptionJob,
  };
};
