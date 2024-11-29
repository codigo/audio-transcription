# Audio Transcription Webhook Client

A robust and configurable webhook delivery client for sending transcription job status updates. This package is part of the audio transcription service ecosystem and handles reliable webhook delivery with features like retries, rate limiting, payload signing, and concurrent delivery management.

## Features

- 🚀 Concurrent webhook delivery with configurable limits
- 🔄 Automatic retries with exponential backoff
- 🔐 Payload signing with HMAC SHA-256
- ⏱️ Configurable timeouts and retry delays
- 🛡️ Rate limit handling
- 📊 Queue management for reliable delivery
- 🔍 Detailed error reporting

## Installation

```bash
npm install @codigo/audio-transcription-webhook-client
```

## Usage

### Basic Usage

```typescript
import { createWebhookClient } from "@codigo/audio-transcription-webhook-client";
// Create a webhook client with default options
const webhookClient = createWebhookClient();
// Send a notification
await webhookClient.notify("<https://your-webhook-url.com>", {
  id: "job-123",
  status: "completed",
  result: "Transcription text...",
  audioFileUrl: "<https://example.com/audio.mp3>",
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

### With Custom Configuration

```typescript
const webhookClient = createWebhookClient({
  concurrency: 3, // Maximum concurrent deliveries
  maxRetries: 5, // Maximum retry attempts
  retryDelay: 2000, // Initial retry delay in ms
  timeout: 5000, // Request timeout in ms
  signingSecret: "your-secret", // Secret for signing payloads
  headers: {
    // Additional headers
    "X-Custom-Header": "value",
  },
});
```

### Graceful Shutdown

```typescript
// Wait for pending webhooks to complete (with 5s timeout)
await webhookClient.shutdown(5000);
```

## API Reference

### `createWebhookClient(options?: WebhookClientOptions)`

Creates a new webhook client instance.

#### Options

```typescript
interface WebhookClientOptions {
  concurrency?: number; // Default: 5
  maxRetries?: number; // Default: 3
  retryDelay?: number; // Default: 1000
  timeout?: number; // Default: 10000
  signingSecret?: string; // Optional
  headers?: Record<string, string>; // Optional
}
```

### `WebhookClientPort`

The main interface exposed by the client:

```typescript
interface WebhookClientPort {
  notify(webhookUrl: string, job: TranscriptionJob): Promise<void>;
  shutdown(gracePeriodMs?: number): Promise<void>;
}
```

### Webhook Payload Format

When a webhook is delivered, it sends a JSON payload with the following structure:

```typescript
{
  id: string; // Job ID
  status: string; // Job status
  result?: string; // Transcription result (if completed)
  error?: string; // Error message (if failed)
  audioFileUrl: string; // Original audio file URL
  timestamp: string; // ISO timestamp of the notification
  eventType: string; // Always "transcription.status_updated"
}
```

### Security

When a signing secret is provided, the client adds an `x-webhook-signature` header containing an HMAC SHA-256 signature of the payload. You can verify the webhook authenticity by:

```typescript
import { createHmac } from "crypto";
const isValidSignature = (
  payload: string,
  signature: string,
  secret: string,
) => {
  const expectedSignature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return signature === expectedSignature;
};
```
