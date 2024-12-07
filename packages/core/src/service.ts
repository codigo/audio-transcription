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
  // Keep track of pending jobs
  const pendingJobs = new Map<string, Promise<void>>();

  const processTranscription = async (job: TranscriptionJob): Promise<void> => {
    try {
      console.log(`Starting transcription for job ${job.id}`);
      const tempDir = await createTempDir();
      const audioFilePath = path.join(tempDir, `${randomUUID()}.audio`);

      try {
        // Update job status to processing
        console.log(`Updating job ${job.id} to processing status`);
        await deps.storage.updateJob(job.id, { status: "processing" });

        // Download the file
        console.log(`Downloading file for job ${job.id}`);
        await deps.fileDownloader.downloadFile(job.audioFileUrl, audioFilePath);

        // Get transcription from Whisper
        console.log(`Transcribing file for job ${job.id}`);
        const result = await deps.whisperClient.transcribe(audioFilePath);
        console.log(`Got transcription result for job ${job.id}:`, result);

        // Update job with result
        console.log(`Updating job ${job.id} with result`);
        const updatedJob = await deps.storage.updateJob(job.id, {
          status: "completed",
          result,
        });

        // Send webhook if URL was provided
        if (updatedJob.webhookUrl) {
          console.log(`Sending webhook for job ${job.id}`);
          await deps.webhookClient.notify(updatedJob.webhookUrl, updatedJob);
        }
      } finally {
        console.log(`Cleaning up temp dir for job ${job.id}`);
        await cleanupTempDir(tempDir);
      }
    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);
      // Update job with error
      await deps.storage.updateJob(job.id, {
        status: "failed",
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      // Remove job from pending map when done
      pendingJobs.delete(job.id);
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

    // Store the processing promise
    const processingPromise = processTranscription(job).catch((error) => {
      console.error("Background processing failed:", error);
    });
    pendingJobs.set(job.id, processingPromise);

    return job;
  };

  const getTranscriptionJob = async (
    jobId: string,
  ): Promise<TranscriptionJob | null> => {
    return deps.storage.getJob(jobId);
  };

  // Add method to wait for job completion
  const waitForJob = async (jobId: string): Promise<void> => {
    const processingPromise = pendingJobs.get(jobId);
    if (processingPromise) {
      await processingPromise;
    }
  };

  return {
    createTranscriptionJob,
    getTranscriptionJob,
    waitForJob,
  };
};
