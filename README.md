# Audio Transcription

A composable and framework-agnostic service for transcribing audio files using OpenAI's Whisper API.

## Features

- Framework agnostic core with adapters for Fastify and Express
- Asynchronous processing of audio files
- S3 and HTTP file download support with retries and validation
- SQLite storage for job tracking with migrations
- Webhook notifications
- Error handling and retries for API calls
- Fully tested with node-tap
- Written in TypeScript with functional programming principles

## Project Structure

```
audio-transcription-service/
├── packages/
│ ├── core/ # Core business logic and types
│ ├── fastify-adapter/ # Fastify integration
│ ├── express-adapter/ # Express integration
│ ├── storage/ # SQLite storage with migrations
│ ├── file-downloader/ # File download handling
│ ├── whisper-client/ # OpenAI Whisper API client
│ └── webhook-client/ # Webhook notification client
```

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

### System Requirements

You need to have the following installed:

- Node.js 16.x or later
- pnpm 7.x or later
- SQLite3 and development files

#### Ubuntu/Debian

```bash
sudo apt-get update
sudo apt-get install sqlite3 libsqlite3-dev build-essential
```

#### macOS

```bash
brew install sqlite3
```

#### Windows

Install Windows Build Tools (as administrator):

```bash
npm install --global windows-build-tools
```

Make sure Python and Visual Studio Build Tools are properly installed

Verifying Prerequisites

You can verify your setup with:

```bash
node --version

# Check pnpm version
pnpm --version

# Check SQLite version
sqlite3 --version
```

## Usage

### Fastify

```typescript
import Fastify from "fastify";
import { createTranscriptionService } from "@codigo/audio-transcription/core";
import { createFastifyAdapter } from "@codigo/audio-transcription/fastify-adapter";
import { createSqliteStorage } from "@codigo/audio-transcription/storage";
import { createWhisperClient } from "@codigo/audio-transcription/whisper-client";
import { createWebhookClient } from "@codigo/audio-transcription/webhook-client";

const fastify = Fastify();

const storage = createSqliteStorage({
  path: "./transcriptions.db",
});

const whisperClient = createWhisperClient({
  apiKey: process.env.OPENAI_API_KEY,
});

const webhookClient = createWebhookClient({
  endpoint: "https://your-webhook-endpoint.com",
});

const transcriptionService = createTranscriptionService({
  storage,
  whisperClient,
  webhookClient,
});

const transcriptionRouter = createFastifyAdapter(transcriptionService);

fastify.register(transcriptionRouter);

fastify.listen({ port: 3000 });
```

### Express

```typescript
import express from "express";
import { createTranscriptionService } from "@codigo/audio-transcription/core";
import { createExpressAdapter } from "@codigo/audio-transcription/express-adapter";
import { createSqliteStorage } from "@codigo/audio-transcription/storage";
import { createWhisperClient } from "@codigo/audio-transcription/whisper-client";
import { createWebhookClient } from "@codigo/audio-transcription/webhook-client";

const app = express();

const storage = createSqliteStorage({
  path: "./transcriptions.db",
});

const whisperClient = createWhisperClient({
  apiKey: process.env.OPENAI_API_KEY,
});

const webhookClient = createWebhookClient({
  endpoint: "https://your-webhook-endpoint.com",
});

const transcriptionService = createTranscriptionService({
  storage,
  whisperClient,
  webhookClient,
});

const transcriptionRouter = createExpressAdapter(transcriptionService);

app.use("/api/transcriptions", transcriptionRouter);

app.listen(3000);
```

### API

#### POST /transcriptions

Create a new transcription job.

```typescript
interface CreateTranscriptionRequest {
  audioFileUrl: string;
  webhookUrl?: string;
}

interface CreateTranscriptionResponse {
  jobId: string;
}
```

#### GET /transcriptions/:jobId

Get the status and result of a transcription job.

```typescript
interface TranscriptionResponse {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: string;
  error?: string;
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
