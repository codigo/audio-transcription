# @codigo/audio-transcription-whisper-client

A TypeScript client for OpenAI's Whisper API that provides robust audio transcription capabilities with built-in retry logic, error handling, and configurable options.

## Features

- 🔄 Automatic retry mechanism for failed requests
- ⚡ Configurable timeout and file size limits
- 🛡️ Comprehensive error handling
- 🎯 Type-safe API
- ⚙️ Customizable API endpoint

## Installation

```bash
npm install @codigo/audio-transcription-whisper-client
```

## Usage

### Basic Usage

```typescript
import { createWhisperClient } from "@codigo/audio-transcription-whisper-client";
const client = createWhisperClient({
  apiKey: "your-openai-api-key",
});
try {
  const transcription = await client.transcribe("/path/to/audio/file.mp3");
  console.log("Transcription:", transcription);
} catch (error) {
  console.error("Transcription failed:", error);
}
```

### Advanced Configuration

```typescript
const client = createWhisperClient({
  apiKey: "your-openai-api-key",
  baseUrl: "https://custom-api-endpoint.com/v1", // Custom API endpoint
  maxRetries: 5, // Maximum retry attempts
  maxFileSize: 25 * 1024 * 1024, // Maximum file size (25MB)
  timeout: 60000, // Request timeout in milliseconds
});
```

## Configuration Options

| Option        | Type     | Default                       | Description                       |
| ------------- | -------- | ----------------------------- | --------------------------------- |
| `apiKey`      | `string` | (required)                    | Your OpenAI API key               |
| `baseUrl`     | `string` | `"https://api.openai.com/v1"` | Base URL for OpenAI API           |
| `maxRetries`  | `number` | `3`                           | Maximum number of retry attempts  |
| `maxFileSize` | `number` | `25 * 1024 * 1024`            | Maximum file size in bytes (25MB) |
| `timeout`     | `number` | `30000`                       | Request timeout in milliseconds   |

## Error Handling

The client provides specific error types for different failure scenarios:

```typescript
import {
  WhisperError,
  FileTooLargeError,
} from "@codigo/audio-transcription-whisper-client";
try {
  const transcription = await client.transcribe("/path/to/audio/file.mp3");
} catch (error) {
  if (error instanceof FileTooLargeError) {
    console.error("File exceeds size limit");
  } else if (error instanceof WhisperError) {
    console.error("API Error:", error.message);
    console.error("Error Code:", error.code);
    console.error("Status:", error.status);
  }
}
```

### Error Types

- `WhisperError`: Base error class for API-related errors
- `FileTooLargeError`: Thrown when the input file exceeds the size limit

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Cleaning Build Files

```bash
npm run clean
```

## License

[MIT](LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Requirements

- Node.js >= 14
- TypeScript >= 4.5

## Dependencies

- `@codigo/audio-transcription-core`
- `form-data`
- `node-fetch`
- `retry`

## Notes

- The maximum file size limit is set to 25MB by default (OpenAI's limit)
- The client automatically handles rate limiting and retries
- All API calls include proper timeout handling
- The client supports custom API endpoints for self-hosted or proxy setups
