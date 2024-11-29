export interface TranscriptionJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  audioFileUrl: string;
  result?: string;
  error?: string;
  webhookUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoragePort {
  createJob(
    job: Omit<TranscriptionJob, "id" | "createdAt" | "updatedAt">,
  ): Promise<TranscriptionJob>;
  updateJob(
    id: string,
    update: Partial<TranscriptionJob>,
  ): Promise<TranscriptionJob>;
  getJob(id: string): Promise<TranscriptionJob | null>;
  close(): Promise<void>;
}

export interface WhisperClientPort {
  transcribe(audioFilePath: string): Promise<string>;
}

export interface WebhookClientPort {
  notify(webhookUrl: string, job: TranscriptionJob): Promise<void>;
}

export interface FileDownloaderPort {
  downloadFile(url: string, destPath: string): Promise<void>;
}

export interface TranscriptionService {
  createTranscriptionJob(
    audioFileUrl: string,
    webhookUrl?: string,
  ): Promise<TranscriptionJob>;
  getTranscriptionJob(jobId: string): Promise<TranscriptionJob | null>;
}

export interface TranscriptionServiceDependencies {
  storage: StoragePort;
  whisperClient: WhisperClientPort;
  webhookClient: WebhookClientPort;
  fileDownloader: FileDownloaderPort;
}
