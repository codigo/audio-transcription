# 🔔 Audio Transcription Webhook Client

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
pnpm add @codigo/audio-transcription-webhook-client
```

## How It Works

The webhook client is designed to handle reliable delivery of transcription job status updates to configured webhook endpoints. Here's how it works:

1. **Queue Management**: Uses `p-queue` to manage concurrent deliveries and ensure controlled throughput
2. **Retry Logic**: Implements exponential backoff with jitter for failed deliveries
3. **Error Handling**: Wraps all errors in a `WebhookDeliveryError` class with detailed context
4. **Payload Signing**: Optionally signs payloads using HMAC SHA-256 for security
5. **Rate Limiting**: Handles rate limit responses (429) appropriately

## Usage Examples

### Basic Usage

```typescript
import { createWebhookClient } from "@codigo/audio-transcription-webhook-client";

// Create a webhook client with default options
const webhookClient = createWebhookClient();

// Send a notification
await webhookClient.notify("https://your-webhook-url.com", {
  id: "job-123",
  status: "completed",
  result: "Transcription text...",
  audioFileUrl: "https://example.com/audio.mp3",
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

### Advanced Configuration

```typescript
const webhookClient = createWebhookClient({
  // Maximum number of concurrent webhook deliveries
  concurrency: 3,

  // Maximum number of retry attempts for failed deliveries
  maxRetries: 5,

  // Initial retry delay in milliseconds (doubles with each retry + jitter)
  retryDelay: 2000,

  // Request timeout in milliseconds
  timeout: 5000,

  // Secret for signing payloads (HMAC SHA-256)
  signingSecret: "your-secret-key",

  // Additional headers to include in webhook requests
  headers: {
    "X-Custom-Header": "value",
    "X-API-Version": "1.0",
  },
});
```

### Graceful Shutdown

```typescript
// Wait for pending webhooks to complete (with 5s timeout)
await webhookClient.shutdown(5000);
```

## API Reference

### WebhookClientOptions

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

### WebhookClientPort Interface

```typescript
interface WebhookClientPort {
  // Send a webhook notification
  notify(webhookUrl: string, job: TranscriptionJob): Promise<void>;

  // Gracefully shutdown the client
  shutdown(gracePeriodMs?: number): Promise<void>;
}
```

### Webhook Payload Format

```typescript
interface WebhookPayload {
  id: string; // Job ID
  status: string; // Job status (completed, failed, etc.)
  result?: string; // Transcription result (if completed)
  error?: string; // Error message (if failed)
  audioFileUrl: string; // Original audio file URL
  timestamp: string; // ISO timestamp of the notification
  eventType: string; // Always "transcription.status_updated"
}
```

## Security

### Payload Signing

When a signing secret is provided, the client automatically adds an `x-webhook-signature` header containing an HMAC SHA-256 signature of the payload. Verify webhook authenticity on your server:

```typescript
import { createHmac } from "crypto";

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expectedSignature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return signature === expectedSignature;
}

// In your webhook handler:
app.post("/webhook", (req, res) => {
  const signature = req.headers["x-webhook-signature"];
  const isValid = verifyWebhookSignature(
    JSON.stringify(req.body),
    signature,
    "your-secret-key",
  );

  if (!isValid) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Process webhook...
});
```

## Error Handling

The client provides robust error handling through the `WebhookDeliveryError` class:

```typescript
class WebhookDeliveryError extends Error {
  code: string; // Error code (DELIVERY_FAILED, RATE_LIMITED)
  webhookUrl: string; // Target webhook URL
  attempt: number; // Attempt number when error occurred
  statusCode?: number; // HTTP status code (if applicable)
  cause?: Error; // Original error (if available)
}
```

Example of handling webhook delivery errors:

```typescript
try {
  await webhookClient.notify("https://api.example.com/webhook", job);
} catch (error) {
  if (error instanceof WebhookDeliveryError) {
    console.error(`
      Delivery failed:
      Code: ${error.code}
      URL: ${error.webhookUrl}
      Attempt: ${error.attempt}
      Status: ${error.statusCode}
      Message: ${error.message}
    `);
  }
}
```

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

## Best Practices

1. Always implement proper error handling
2. Use payload signing in production
3. Set appropriate timeout values based on your needs
4. Configure retry attempts based on your reliability requirements
5. Implement webhook verification on your server
6. Use graceful shutdown when stopping your application

## License

MIT
