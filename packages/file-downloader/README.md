# 📥 @codigo/audio-transcription-file-downloader

A robust and efficient file downloader service that handles streaming downloads with built-in safety features. It's designed to safely download files from HTTP sources while handling errors, timeouts, and cleanup gracefully.

## Core Features

- 🚀 Streaming downloads using Node.js streams
- 🔒 Built-in file size limits protection
- ⏱️ Configurable timeout handling
- 🧹 Automatic cleanup on failed downloads
- 💪 TypeScript support with strong typing
- 🛡️ Comprehensive error handling with specific error codes

## Installation

```bash
pnpm add @codigo/audio-transcription-file-downloader
```

## How It Works

The file downloader uses Node.js streams and the `undici` HTTP client to efficiently download files:

1. Creates a write stream to the destination path
2. Streams the download directly to disk instead of loading it into memory
3. Monitors download size in real-time
4. Automatically cleans up partial downloads on failure
5. Provides detailed error information through custom error types

## Basic Usage

```typescript
import { createFileDownloader } from "@codigo/audio-transcription-file-downloader";
const downloader = createFileDownloader({
timeout: 30000, // 30 seconds timeout
maxFileSize: 25_000_000, // 25MB max file size
headers: {
'Authorization': 'Bearer your-token'
}
});
try {
await downloader.downloadFile(
'<https://example.com/large-file.mp3>',
'./downloads/file.mp3'
);
console.log('Download completed successfully');
} catch (error) {
if (error instanceof FileDownloaderError) {
console.error(Download failed: ${error.code} - ${error.message});
}
}
```

## API Reference

### createFileDownloader(options?)

Creates a new file downloader instance with optional configuration.

```typescript
interface FileDownloaderOptions {
  timeout?: number; // Default: 30000 (30 seconds)
  maxFileSize?: number; // Default: 25MB
  headers?: Record<string, string>;
}
```

### FileDownloaderPort Interface

```typescript
interface FileDownloaderPort {
  downloadFile(url: string, destPath: string): Promise<void>;
}
```

## Error Handling

The service uses a custom `FileDownloaderError` class that provides specific error codes:

```typescript
class FileDownloaderError extends Error {
constructor(
message: string,
public readonly code: string,
public readonly cause?: Error
)
}
```

### Error Codes and Scenarios

| Error Code      | Description                      | Common Causes                                |
| --------------- | -------------------------------- | -------------------------------------------- |
| FILE_TOO_LARGE  | File exceeds maximum size limit  | Large files, incorrect Content-Length header |
| HTTP_ERROR      | Non-200 HTTP response            | 404, 403, 500 responses                      |
| TIMEOUT_ERROR   | Download exceeded timeout period | Slow connection, server issues               |
| EMPTY_RESPONSE  | Server returned empty response   | Misconfigured server, invalid URL            |
| DOWNLOAD_FAILED | Generic download failure         | Network issues, file system errors           |

## Advanced Usage Examples

### With Progress Tracking

```typescript
import { createFileDownloader } from "@codigo/audio-transcription-file-downloader";
import { createWriteStream } from "fs";
const downloader = createFileDownloader({
maxFileSize: 100 1024 1024 // 100MB
});
// Track download progress
let downloadedSize = 0;
const onProgress = (chunk: Buffer) => {
downloadedSize += chunk.length;
console.log(Downloaded: ${downloadedSize} bytes);
};
try {
await downloader.downloadFile(
'<https://example.com/large-file.mp3>',
'./downloads/file.mp3'
);
} catch (error) {
if (error instanceof FileDownloaderError) {
switch (error.code) {
case 'FILE_TOO_LARGE':
console.error('File exceeds size limit');
break;
case 'TIMEOUT_ERROR':
console.error('Download timed out');
break;
// Handle other error codes...
}
}
}
```

### With Custom Headers (e.g., for S3)

```typescript
const downloader = createFileDownloader({
  headers: {
    Authorization: "Bearer token",
    "x-amz-security-token": "aws-session-token",
  },
});
await downloader.downloadFile(
  "<https://my-bucket.s3.amazonaws.com/file.mp3>",
  "./downloads/file.mp3",
);
```

## Best Practices

### 1. Always handle cleanup in a finally block

```typescript
let tempPath;
try {
  tempPath = "./temp-download.tmp";
  await downloader.downloadFile(url, tempPath);
  // Process file...
} finally {
  if (tempPath) {
    await fs.promises.unlink(tempPath).catch(() => {});
  }
}
```

### 2. Set appropriate size limits for your use case

```typescript
const downloader = createFileDownloader({
maxFileSize: 50 1024 1024, // 50MB
timeout: 60000 // 60 seconds
});
```

### 3. Use with temporary directories

```typescript
import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
const tempDir = await mkdtemp(join(tmpdir(), "downloads-"));
const tempFile = join(tempDir, "download.tmp");
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

## License

MIT
