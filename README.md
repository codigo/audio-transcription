# Audio Transcription

A composable and framework-agnostic service for transcribing audio files using OpenAI's Whisper API.

## Features

- Framework agnostic core with adapters for Fastify and Express
- Asynchronous processing of audio files
- S3 and HTTP file download support with retries and validation
- SQLite storage for job tracking with migrations
- Webhook notifications with retry logic and payload signing
- Error handling and retries for API calls
- Fully tested with node-tap
- Written in TypeScript with functional programming principles

## Project Structure

```bash
audio-transcription-service/
├── packages/
│ ├── core/           # Core business logic and types
│ ├── fastify-adapter/# Fastify integration
│ ├── express-adapter/# Express integration
│ ├── storage/        # SQLite storage with migrations
│ ├── file-downloader/# File download handling with streaming
│ ├── whisper-client/ # OpenAI Whisper API client
│ └── webhook-client/ # Webhook notification client with retries
```

## Prerequisites

Before installing, ensure you have:

- Node.js 22.x or later
- pnpm 9.x or later

### System Dependencies

Some packages require additional system dependencies:

- **SQLite3**: Required by the storage package
  - See [@codigo/audio-transcription-storage](packages/storage/README.md#prerequisites) for installation instructions
- **Build Tools**: Required for native dependencies
  - See individual package READMEs for platform-specific requirements

## Installation

```bash
pnpm install @codigo/audio-transcription/core @codigo/audio-transcription/storage @codigo/audio-transcription/whisper-client @codigo/audio-transcription/webhook-client @codigo/audio-transcription/file-downloader
```

Then install your preferred framework adapter:

```bash
pnpm install @codigo/audio-transcription/fastify-adapter
# or
pnpm install @codigo/audio-transcription/express-adapter
```

### Verifying Installation

You can verify your setup with:

```bash
# Check Node.js version
node --version

# Check pnpm version
pnpm --version

# Verify SQLite installation
sqlite3 --version
```

## Usage

### Basic Setup

```typescript
import { createTranscriptionService } from "@codigo/audio-transcription/core";
import { createSqliteStorage } from "@codigo/audio-transcription/storage";
import { createWhisperClient } from "@codigo/audio-transcription/whisper-client";
import { createWebhookClient } from "@codigo/audio-transcription/webhook-client";
import { createFileDownloader } from "@codigo/audio-transcription/file-downloader";

// Initialize core dependencies
const storage = createSqliteStorage({
  path: "./transcriptions.db",
  migrate: true, // Run migrations automatically
});

const whisperClient = createWhisperClient({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 30000,
});

const webhookClient = createWebhookClient({
  concurrency: 3,
  maxRetries: 5,
  signingSecret: process.env.WEBHOOK_SECRET,
});

const fileDownloader = createFileDownloader({
  maxFileSize: 25 * 1024 * 1024, // 25MB
  timeout: 30000,
});

// Create the transcription service
const transcriptionService = createTranscriptionService({
  storage,
  whisperClient,
  webhookClient,
  fileDownloader,
});
```

### Framework Integration

#### Fastify

```typescript
import Fastify from "fastify";
import { createFastifyAdapter } from "@codigo/audio-transcription/fastify-adapter";

const fastify = Fastify();
const transcriptionRouter = createFastifyAdapter(transcriptionService);

fastify.register(transcriptionRouter);
fastify.listen({ port: 3000 });
```

#### Express

```typescript
import express from "express";
import { createExpressAdapter } from "@codigo/audio-transcription/express-adapter";

const app = express();
const transcriptionRouter = createExpressAdapter(transcriptionService);

app.use("/api/transcriptions", transcriptionRouter);
app.listen(3000);
```

### API Usage

#### Create a Transcription Job

```typescript
// POST /transcriptions
const response = await fetch("http://localhost:3000/transcriptions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    audioFileUrl: "https://example.com/audio.mp3",
    webhookUrl: "https://your-webhook.com/callback",
  }),
});

const { jobId } = await response.json();
```

#### Check Job Status

```typescript
// GET /transcriptions/:jobId
const response = await fetch(`http://localhost:3000/transcriptions/${jobId}`);
const job = await response.json();

console.log(job.status); // "pending" | "processing" | "completed" | "failed"
console.log(job.result); // Transcription text when completed
```

### Webhook Notifications

When a job completes, a webhook notification is sent with the following payload:

```typescript
{
  id: string;          // Job ID
  status: string;      // Job status
  result?: string;     // Transcription result (if completed)
  error?: string;      // Error message (if failed)
  audioFileUrl: string;// Original audio file URL
  timestamp: string;   // ISO timestamp
  eventType: string;   // "transcription.status_updated"
}
```

## Development

### Install dependencies

```bash
pnpm install
```

### Run tests

```bash
pnpm test
```

### Build all packages

```bash
pnpm build
```

### Run specific package tests

```bash
pnpm --filter @codigo/audio-transcription/core test
```

## License

MIT

## Configuration

### File Downloader

The file downloader supports the following options:

```typescript
interface FileDownloaderOptions {
  timeout?: number; // Request timeout in ms (default: 30000)
  maxFileSize?: number; // Max file size in bytes (default: 25MB)
  headers?: Record<string, string>; // Custom request headers
}
```

### Whisper Client

The Whisper client can be configured with:

```typescript
interface WhisperClientOptions {
  apiKey: string; // OpenAI API key
  baseUrl?: string; // Custom API URL
  maxRetries?: number; // Max retry attempts (default: 3)
  maxFileSize?: number; // Max file size in bytes (default: 25MB)
  timeout?: number; // Request timeout in ms (default: 30000)
}
```

### SQLite Storage

The SQLite storage supports:

```typescript
interface SqliteStorageOptions {
  path: string; // Path to SQLite database file
  migrate?: boolean; // Run migrations on startup (default: true)
}
```

## Error Handling

The service includes comprehensive error handling:

- `FileDownloaderError`: For file download issues
- `WhisperError`: For transcription API errors
- `SqliteError`: For database operations
- `SqliteInitializationError`: For database setup issues

Each error includes:

- Descriptive message
- Error code
- Original error cause (when available)
- HTTP status (for API errors)
