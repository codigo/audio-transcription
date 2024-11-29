# @codigo/audio-transcription-core

Core functionality for the audio transcription service, providing a clean and type-safe interface for managing audio transcription jobs.

## Features

- Create and manage audio transcription jobs
- Async job processing with webhook notifications
- Type-safe interfaces for all dependencies
- Modular architecture with dependency injection
- Temporary file handling with automatic cleanup

## Installation

```bash
npm install @codigo/audio-transcription-core
```

## Usage

### Basic Setup

```typescript
import { createTranscriptionService } from "@codigo/audio-transcription-core";
// Initialize with your implementations of the required dependencies
const transcriptionService = createTranscriptionService({
  storage, // Implementation of StoragePort
  whisperClient, // Implementation of WhisperClientPort
  webhookClient, // Implementation of WebhookClientPort
  fileDownloader, // Implementation of FileDownloaderPort
});
```

### Creating a Transcription Job

```typescript
// Create a new transcription job
const job = await transcriptionService.createTranscriptionJob(
  "https://example.com/audio.mp3",
  "https://your-webhook.com/callback", // Optional webhook URL
);
console.log(job.id); // Unique job identifier
console.log(job.status); // Initially 'pending'
```

### Checking Job Status

```typescript
const job = await transcriptionService.getTranscriptionJob(jobId);
if (job) {
  switch (job.status) {
    case "completed":
      console.log("Transcription:", job.result);
      break;
    case "failed":
      console.log("Error:", job.error);
      break;
    case "processing":
      console.log("Job is still processing");
      break;
    case "pending":
      console.log("Job is queued");
      break;
  }
}
```

## Interface Definitions

### TranscriptionJob

```typescript
interface TranscriptionJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  audioFileUrl: string;
  result?: string;
  error?: string;
  webhookUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Required Dependencies

You need to provide implementations for the following interfaces:

```typescript
interface StoragePort {
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
interface WhisperClientPort {
  transcribe(audioFilePath: string): Promise<string>;
}
interface WebhookClientPort {
  notify(webhookUrl: string, job: TranscriptionJob): Promise<void>;
}
interface FileDownloaderPort {
  downloadFile(url: string, destPath: string): Promise<void>;
}
```

## Error Handling

The service automatically handles errors during the transcription process:

- Failed transcriptions are marked with status `failed`
- Error messages are stored in the job's `error` field
- Temporary files are cleaned up even if processing fails
- Webhook notifications are only sent for successful transcriptions

## Development

```bash
# Install dependencies
npm install
# Run tests
npm test
# Build the package
npm run build
# Clean build artifacts
npm run clean
```
