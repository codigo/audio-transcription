# @codigo/audio-transcription-file-downloader

A robust and efficient file downloader with stream handling, automatic cleanup, and safety features. Perfect for downloading files from pre-signed S3 URLs or any HTTP source.

## Features

- 🚀 Efficient streaming download
- 🧹 Automatic cleanup on failures
- ⚡ Progress tracking
- 🔒 File size limits
- ⏱️ Timeout handling
- 🛡️ Error handling with custom error types
- 📝 TypeScript support

## Installation

```bash
# Using pnpm
pnpm add @codigo/audio-transcription-file-downloader

# Using npm
npm install @codigo/audio-transcription-file-downloader

# Using yarn
yarn add @codigo/audio-transcription-file-downloader
```

## Usage

```typescript
import { createFileDownloader } from '@codigo/audio-transcription-file-downloader';

const downloader = createFileDownloader();

try {
  await downloader.downloadFile(
    'https://example.com/myfile.mp3',
    '/path/to/destination.mp3'
  );
  console.log('File downloaded successfully!');
} catch (error) {
  if (error instanceof FileDownloaderError) {
    console.error('Download failed:', error.message, error.code);
  }
}
```

### With Custom Options

```typescript
const downloader = createFileDownloader({
  // 5MB maximum file size
  maxFileSize: 5 * 1024 * 1024,
  // 10 second timeout
  timeout: 10000,
  // Custom headers (useful for authorization)
  headers: {
    'Authorization': 'Bearer token',
    'X-Custom-Header': 'value'
  }
});
```

### With Pre-signed S3 URLs

```typescript
const downloader = createFileDownloader();

// The URL already contains the necessary authentication parameters
const s3PreSignedUrl = 'https://my-bucket.s3.amazonaws.com/file.mp3?AWSAccessKeyId=...';

try {
  await downloader.downloadFile(
    s3PreSignedUrl,
    '/local/path/file.mp3'
  );
  console.log('S3 file downloaded successfully!');
} catch (error) {
  console.error('S3 download failed:', error.message);
}
```

### API Reference

```typescript
createFileDownloader(options?)Creates a new file downloader instance.Optionsinterface FileDownloaderOptions {
  /**
   * Timeout in milliseconds for the download request
   * @default 30000
   */
  timeout?: number;

  /**
   * Maximum file size in bytes
   * @default 25 * 1024 * 1024 (25MB)
   */
  maxFileSize?: number;

  /**
   * Additional headers to send with the request
   */
  headers?: Record<string, string>;
}
```

Returns an object implementing the FileDownloaderPort interface:

```typescript
interface FileDownloaderPort {
  downloadFile(url: string, destPath: string): Promise<void>;
}
```

### Error Handling

The downloader throws FileDownloaderError instances with specific error codes:

```typescript
try {
  await downloader.downloadFile(url, destPath);
} catch (error) {
  if (error instanceof FileDownloaderError) {
    switch (error.code) {
      case 'FILE_TOO_LARGE':
        console.error('File exceeds size limit');
        break;
      case 'HTTP_ERROR':
        console.error('HTTP request failed:', error.message);
        break;
      case 'STREAM_ERROR':
        console.error('Stream processing error:', error.message);
        break;
      case 'WRITE_ERROR':
        console.error('File system write error:', error.message);
        break;
      case 'TIMEOUT_ERROR':
        console.error('Download timeout exceeded');
        break;
      case 'EMPTY_RESPONSE':
        console.error('Empty response body received');
        break;
      case 'DOWNLOAD_FAILED':
        console.error('General download failure:', error.message);
        break;
    }
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `FILE_TOO_LARGE` | File size exceeds the configured maximum |
| `HTTP_ERROR` | HTTP request failed (non-200 response) |
| `STREAM_ERROR` | Error processing the download stream |
| `WRITE_ERROR` | Error writing to the destination file |
| `TIMEOUT_ERROR` | Download timeout exceeded |
| `EMPTY_RESPONSE` | No data received in response |
| `DOWNLOAD_FAILED` | General download failure |

Always handle cleanup:

```typescript
let tempPath;
try {
  tempPath = '/tmp/download.tmp';
  await downloader.downloadFile(url, tempPath);
  // Process the file...
} finally {
  if (tempPath) {
    await fs.promises.unlink(tempPath).catch(() => {});
  }
}
```

Set appropriate size limits:

```typescript
const downloader = createFileDownloader({
  maxFileSize: 10 * 1024 * 1024, // 10MB
});
```

Use with temp files:

```typescript
import { mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const tempDir = await mkdtemp(join(tmpdir(), 'downloads-'));
const tempFile = join(tempDir, 'download.tmp');

```

## License

MIT

## Contributing

Contributions are welcome! Please see our contributing guidelines for details.
