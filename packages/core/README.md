# 🎯 @codigo/audio-transcription-core

Core functionality for the audio transcription service, providing a clean and type-safe interface for managing audio transcription jobs. This package implements the core business logic for handling audio transcription jobs in a framework-agnostic way.

## Architecture

The core package follows a ports and adapters (hexagonal) architecture pattern:

- **Core Service**: Implements the main business logic in `TranscriptionService`
- **Ports**: Defines interfaces for external dependencies (storage, file handling, etc.)
- **Pure Functions**: Uses functional programming principles for predictable behavior

## Key Components

### TranscriptionService

The main service that orchestrates the transcription workflow:

```typescript
interface TranscriptionService {
  // Creates a new transcription job and starts processing
  createTranscriptionJob(
    audioFileUrl: string,
    webhookUrl?: string,
  ): Promise<TranscriptionJob>;

  // Retrieves the status and result of a job
  getTranscriptionJob(jobId: string): Promise<TranscriptionJob | null>;

  // Waits for a job to complete processing
  waitForJob(jobId: string): Promise<void>;
}
```

### Job Processing Flow

1. Job Creation:

   - Creates a new job with "pending" status
   - Generates a unique job ID
   - Stores initial job metadata

2. Background Processing:

   - Downloads the audio file to a temporary location
   - Updates job status to "processing"
   - Sends file to Whisper API for transcription
   - Updates job with result or error
   - Cleans up temporary files
   - Sends webhook notification if configured

3. Error Handling:
   - Automatic cleanup of temporary files
   - Detailed error reporting
   - Failed job status tracking

## 📦 Installation

```bash
pnpm add @codigo/audio-transcription-core
```

## Usage Example

Here's a complete example of setting up and using the transcription service:

```typescript
import { createTranscriptionService } from "@codigo/audio-transcription-core";

// 1. Implement required dependencies
const storage = {
  createJob: async (job) => ({
    ...job,
    id: "123",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  updateJob: async (id, update) => ({ ...update, id, updatedAt: new Date() }),
  getJob: async (id) => ({
    id,
    status: "completed",
    audioFileUrl: "...",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  close: async () => {},
};

const whisperClient = {
  transcribe: async (filePath) => "Transcribed text result",
};

const webhookClient = {
  notify: async (url, job) => {
    await fetch(url, { method: "POST", body: JSON.stringify(job) });
  },
  shutdown: async () => {},
};

const fileDownloader = {
  downloadFile: async (url, destPath) => {
    // Download implementation
  },
};

// 2. Create the service instance
const transcriptionService = createTranscriptionService({
  storage,
  whisperClient,
  webhookClient,
  fileDownloader,
});

// 3. Use the service
async function example() {
  // Create a new transcription job
  const job = await transcriptionService.createTranscriptionJob(
    "https://example.com/audio.mp3",
    "https://your-webhook.com/callback",
  );

  console.log("Created job:", job.id);

  // Option 1: Wait for job completion
  await transcriptionService.waitForJob(job.id);
  const result = await transcriptionService.getTranscriptionJob(job.id);
  console.log("Transcription:", result?.result);

  // Option 2: Check job status manually
  const status = await transcriptionService.getTranscriptionJob(job.id);
  if (status?.status === "completed") {
    console.log("Transcription:", status.result);
  }
}
```

## Required Dependencies

The service requires implementations of four port interfaces:

### StoragePort

Handles persistence of job data:

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
```

### WhisperClientPort

Handles the actual transcription:

```typescript
interface WhisperClientPort {
  transcribe(audioFilePath: string): Promise<string>;
}
```

### WebhookClientPort

Manages webhook notifications:

```typescript
interface WebhookClientPort {
  notify(webhookUrl: string, job: TranscriptionJob): Promise<void>;
  shutdown(): Promise<void>;
}
```

### FileDownloaderPort

Handles audio file downloads:

```typescript
interface FileDownloaderPort {
  downloadFile(url: string, destPath: string): Promise<void>;
}
```

## Job States and Waiting

A transcription job can be in one of four states:

- **pending**: Initial state when job is created
- **processing**: Audio file is being downloaded and transcribed
- **completed**: Transcription finished successfully
- **failed**: An error occurred during processing

You can wait for a job to finish processing using the `waitForJob` method:

```typescript
// Create a job and wait for completion
const job = await service.createTranscriptionJob(audioFileUrl);
await service.waitForJob(job.id);

// Check the final result
const result = await service.getTranscriptionJob(job.id);
if (result?.status === "completed") {
  console.log("Transcription:", result.result);
} else if (result?.status === "failed") {
  console.error("Failed:", result.error);
}
```

This is particularly useful when you need to ensure a job has completed before proceeding with further processing.

## Error Handling

The service implements comprehensive error handling:

- Automatic cleanup of temporary files
- Detailed error messages stored in job records
- Failed jobs marked with appropriate status
- Background processing errors logged but don't crash the service

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build the package
pnpm build

# Clean build artifacts
pnpm clean
```

## Type Definitions

The package exports all type definitions for use in TypeScript projects:

```typescript
import type {
  TranscriptionJob,
  TranscriptionService,
  StoragePort,
  WhisperClientPort,
  WebhookClientPort,
  FileDownloaderPort,
} from "@codigo/audio-transcription-core";
```

## Best Practices

- Always implement proper error handling in port implementations
- Use the webhook feature for long-running transcriptions
- Implement retries in external service clients
- Monitor job statuses for stuck or failed jobs
- Implement proper cleanup in storage implementations

## Contributing

If you'd like to contribute to this project, please follow these steps:

1. Fork the repository
2. Create a new branch
3. Make your changes
4. Commit the changes
5. Push the changes to your fork
6. Open a pull request
