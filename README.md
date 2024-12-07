# Audio Transcription Service

A robust, modular, and framework-agnostic service for transcribing audio files using OpenAI's Whisper API. Built with TypeScript and functional programming principles, this service provides reliable audio transcription with features like automatic retries, webhook notifications, and job tracking.

## 🌟 Key Features

- 🎯 Framework agnostic core with adapters for popular web frameworks
- 🔄 Asynchronous processing with job tracking
- 📥 Robust file downloading with size limits and validation
- 💾 Persistent storage with SQLite and automatic migrations
- 🔔 Reliable webhook notifications with retries and payload signing
- 🛡️ Comprehensive error handling and retry mechanisms
- ✅ Fully tested with tap
- 📝 Written in TypeScript with functional programming principles

## 📦 Project Structure

```bash
audio-transcription-service/
├── packages/
│   ├── core/              # Core business logic and interfaces
│   ├── storage/           # SQLite-based job storage
│   ├── whisper-client/    # OpenAI Whisper API client
│   ├── webhook-client/    # Webhook notification system
│   ├── file-downloader/   # File download handling
│   ├── fastify-adapter/   # Fastify integration
│   └── express-adapter/   # Express integration
```

## 🚀 Getting Started

### Prerequisites

- Node.js 22.x or later
- pnpm 9.x or later
- SQLite3 development files

### Installation

```bash
# Install core packages
pnpm add @codigo/audio-transcription-core \
        @codigo/audio-transcription-storage \
        @codigo/audio-transcription-whisper-client \
        @codigo/audio-transcription-webhook-client \
        @codigo/audio-transcription-file-downloader

# Install your preferred framework adapter
pnpm add @codigo/audio-transcription-fastify-adapter
# or
pnpm add @codigo/audio-transcription-express-adapter
```

## 💡 Usage Examples

### Basic Setup

```typescript
import { createTranscriptionService } from "@codigo/audio-transcription-core";
import { createSqliteStorage } from "@codigo/audio-transcription-storage";
import { createWhisperClient } from "@codigo/audio-transcription-whisper-client";
import { createWebhookClient } from "@codigo/audio-transcription-webhook-client";
import { createFileDownloader } from "@codigo/audio-transcription-file-downloader";

// Initialize dependencies
const storage = createSqliteStorage({
  path: "./transcriptions.db",
  migrate: true,
});

const whisperClient = createWhisperClient({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
});

const webhookClient = createWebhookClient({
  signingSecret: process.env.WEBHOOK_SECRET,
  maxRetries: 5,
});

const fileDownloader = createFileDownloader({
  maxFileSize: 25 * 1024 * 1024, // 25MB
  timeout: 30000,
});

// Create service instance
const transcriptionService = createTranscriptionService({
  storage,
  whisperClient,
  webhookClient,
  fileDownloader,
});
```

### Framework Integration

#### With Fastify

```typescript
import Fastify from "fastify";
import { createFastifyAdapter } from "@codigo/audio-transcription-fastify-adapter";

const fastify = Fastify();
const transcriptionRouter = createFastifyAdapter(transcriptionService);

fastify.register(transcriptionRouter);
fastify.listen({ port: 3000 });
```

#### With Express

```typescript
import express from "express";
import { createExpressAdapter } from "@codigo/audio-transcription-express-adapter";

const app = express();
const transcriptionRouter = createExpressAdapter(transcriptionService);

app.use("/api/transcriptions", transcriptionRouter);
app.listen(3000);
```

## 🔌 API Usage

### Create a Transcription Job

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

### Check Job Status

```typescript
// GET /transcriptions/:jobId
const response = await fetch(`http://localhost:3000/transcriptions/${jobId}`);
const job = await response.json();

console.log("Status:", job.status); // "pending" | "processing" | "completed" | "failed"
console.log("Result:", job.result); // Transcription text when completed
```

## 🔔 Webhook Notifications

When a job status changes, a webhook notification is sent with:

```typescript
{
  id: string;           // Job ID
  status: string;       // Current job status
  result?: string;      // Transcription result (if completed)
  error?: string;       // Error message (if failed)
  audioFileUrl: string; // Original audio file URL
  timestamp: string;    // ISO timestamp
  eventType: string;    // "transcription.status_updated"
}
```

### Verifying Webhook Signatures

```typescript
import { createHmac } from "crypto";

function verifyWebhook(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expectedSignature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return signature === expectedSignature;
}
```

## 🛠️ Development

### Install Dependencies

```bash
pnpm install
```

### Run Tests

```bash
# Run all tests
pnpm test

# Test specific package
pnpm --filter @codigo/audio-transcription-core test
```

### Build Packages

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @codigo/audio-transcription-core build
```

## 📝 Configuration Options

### File Downloader

```typescript
interface FileDownloaderOptions {
  timeout?: number; // Request timeout (default: 30000ms)
  maxFileSize?: number; // Max file size (default: 25MB)
  headers?: Record<string, string>; // Custom headers
}
```

### Whisper Client

```typescript
interface WhisperClientOptions {
  apiKey: string; // OpenAI API key
  maxRetries?: number; // Max retries (default: 3)
  timeout?: number; // Request timeout (default: 30000ms)
}
```

### Storage

```typescript
interface StorageOptions {
  path: string; // Path to SQLite database
  migrate?: boolean; // Run migrations (default: true)
}
```

## 🔍 Error Handling

The service provides specific error types for different scenarios:

```typescript
try {
  const job = await transcriptionService.createTranscriptionJob(
    "https://example.com/audio.mp3",
  );
} catch (error) {
  if (error instanceof WhisperError) {
    // Handle transcription API errors
  } else if (error instanceof FileDownloaderError) {
    // Handle download errors
  } else if (error instanceof StorageError) {
    // Handle database errors
  }
}
```

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
