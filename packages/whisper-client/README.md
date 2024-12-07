# 🎤 @codigo/audio-transcription-whisper-client

A robust TypeScript client for OpenAI's Whisper API that provides audio transcription capabilities. This client includes built-in retry logic, comprehensive error handling, request timeouts, and configurable options.

## Overview

The Whisper client provides a simple interface to transcribe audio files using OpenAI's Whisper API. It handles:

- Audio file validation and size checks
- API authentication and requests
- Automatic retries for failed requests
- Rate limiting
- Request timeouts
- Error handling with specific error types

## 📦 Installation

```bash
pnpm add @codigo/audio-transcription-whisper-client
```

## Detailed Usage

### Basic Example

```typescript
import { createWhisperClient } from "@codigo/audio-transcription-whisper-client";

const client = createWhisperClient({
  apiKey: "your-openai-api-key",
});

async function transcribeAudio() {
  try {
    const transcription = await client.transcribe("/path/to/audio/file.mp3");
    console.log("Transcription:", transcription);
  } catch (error) {
    console.error("Transcription failed:", error);
  }
}
```

### Advanced Configuration Example

```typescript
const client = createWhisperClient({
  apiKey: "your-openai-api-key",
  baseUrl: "https://custom-api-endpoint.com/v1", // Use a custom API endpoint
  maxRetries: 5, // Retry failed requests up to 5 times
  maxFileSize: 25 * 1024 * 1024, // Limit file size to 25MB
  timeout: 60000, // Set request timeout to 60 seconds
});
```

## API Reference

### `createWhisperClient(options)`

Creates a new instance of the Whisper client.

#### Options

| Option        | Type     | Default                       | Description                       |
| ------------- | -------- | ----------------------------- | --------------------------------- |
| `apiKey`      | `string` | (required)                    | OpenAI API key for authentication |
| `baseUrl`     | `string` | `"https://api.openai.com/v1"` | Base URL for the OpenAI API       |
| `maxRetries`  | `number` | `3`                           | Maximum number of retry attempts  |
| `maxFileSize` | `number` | `25 * 1024 * 1024`            | Maximum file size in bytes (25MB) |
| `timeout`     | `number` | `30000`                       | Request timeout in milliseconds   |

### `client.transcribe(audioFilePath)`

Transcribes an audio file to text.

- **Input**: Path to the audio file
- **Returns**: Promise resolving to the transcribed text
- **Throws**: `WhisperError` or `FileTooLargeError` on failure

## Error Handling

The client provides specific error types for different scenarios:

```typescript
import {
  WhisperError,
  FileTooLargeError,
} from "@codigo/audio-transcription-whisper-client";

try {
  const transcription = await client.transcribe("/path/to/audio.mp3");
} catch (error) {
  if (error instanceof FileTooLargeError) {
    // Handle file size exceeded error
    console.error("File is too large:", error.message);
  } else if (error instanceof WhisperError) {
    // Handle API-related errors
    console.error("API Error:", {
      message: error.message,
      code: error.code,
      status: error.status,
    });
  }
}
```

### Error Types

#### `WhisperError`

Base error class containing:

- `message`: Error description
- `code`: Error code (e.g., 'API_ERROR', 'RATE_LIMIT_EXCEEDED')
- `status`: HTTP status code (if applicable)
- `cause`: Original error that caused this error (if any)

#### `FileTooLargeError`

Thrown when the input file exceeds the size limit. Contains:

- `message`: Description with file size details
- `code`: Always 'FILE_TOO_LARGE'

## Retry Behavior

The client automatically retries failed requests with exponential backoff:

- Initial retry delay: 1 second
- Maximum retry delay: 5 seconds
- Exponential factor: 2
- Random jitter: Enabled
- Retryable errors: Network errors, 5xx errors, rate limits
- Non-retryable errors: File too large, File not found, Permission denied

## Examples

### Handling Rate Limits

```typescript
const client = createWhisperClient({
  apiKey: "your-openai-api-key",
  maxRetries: 5, // Increase retries for rate-limited environments
});

try {
  const transcription = await client.transcribe("/path/to/audio.mp3");
  console.log("Success:", transcription);
} catch (error) {
  if (error instanceof WhisperError && error.code === "RATE_LIMIT_EXCEEDED") {
    console.error("Rate limit reached after all retries");
  }
}
```

### Custom API Endpoint with Timeout

```typescript
const client = createWhisperClient({
  apiKey: "your-openai-api-key",
  baseUrl: "https://your-proxy.com/whisper/v1",
  timeout: 120000, // 2 minutes
});

try {
  const transcription = await client.transcribe("/path/to/large-audio.mp3");
  console.log("Transcription complete:", transcription);
} catch (error) {
  if (error instanceof WhisperError && error.code === "TIMEOUT") {
    console.error("Request timed out after 2 minutes");
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

## Requirements

- Node.js >= 14
- TypeScript >= 4.5

## Dependencies

- `@codigo/audio-transcription-core`: Core interfaces and types
- `form-data`: Multipart form data handling
- `undici`: HTTP client
- `retry`: Retry mechanism implementation

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
