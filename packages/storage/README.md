# 💾 @codigo/audio-transcription-storage

SQLite-based storage implementation for the audio transcription service. This package provides persistent storage for transcription jobs using SQLite as the backend database.

## Features

- Persistent storage of transcription jobs using SQLite
- Automatic database migrations
- Type-safe API with TypeScript
- Robust error handling
- Connection pooling and WAL mode for better performance
- Atomic operations with transaction support

## Installation

```bash
pnpm add @codigo/audio-transcription-storage
```

## Prerequisites

The package requires SQLite3 development files to be installed:

- Ubuntu/Debian: `sudo apt-get install sqlite3 libsqlite3-dev`
- macOS: `brew install sqlite3`
- Windows: `pnpm add --global windows-build-tools`

## Usage

### Basic Example

```typescript
import { createSqliteStorage } from "@codigo/audio-transcription-storage";

async function main() {
  // Initialize storage
  const storage = await createSqliteStorage({
    path: "./transcriptions.db",
  });

  try {
    // Create a new transcription job
    const job = await storage.createJob({
      status: "pending",
      audioFileUrl: "https://example.com/audio.mp3",
      webhookUrl: "https://example.com/webhook",
    });
    console.log("Created job:", job.id);

    // Get job status
    const retrievedJob = await storage.getJob(job.id);
    console.log("Job status:", retrievedJob?.status);

    // Update job with results
    const updatedJob = await storage.updateJob(job.id, {
      status: "completed",
      result: "This is the transcription text",
    });
    console.log("Job completed:", updatedJob.result);
  } finally {
    // Always close the connection when done
    await storage.close();
  }
}
```

### Detailed API Reference

#### Creating Storage Instance

```typescript
const storage = await createSqliteStorage({
  path: string;      // Path to SQLite database file
  migrate?: boolean; // Whether to run migrations (default: true)
});
```

#### Job Operations

##### Creating Jobs

```typescript
const job = await storage.createJob({
  status: "pending" | "processing" | "completed" | "failed",
  audioFileUrl: string,
  webhookUrl?: string
});
```

The `createJob` method:

- Generates a unique ID for the job
- Sets creation and update timestamps
- Returns the complete job object

##### Retrieving Jobs

```typescript
const job = await storage.getJob(jobId);
```

Returns:

- The job object if found
- `null` if no job exists with the given ID

##### Updating Jobs

```typescript
const updatedJob = await storage.updateJob(jobId, {
  status?: "pending" | "processing" | "completed" | "failed",
  result?: string,
  error?: string,
  webhookUrl?: string
});
```

- Updates only the specified fields
- Automatically updates the `updatedAt` timestamp
- Returns the complete updated job object
- Throws if job doesn't exist

### Job Object Structure

```typescript
interface TranscriptionJob {
  id: string; // Unique identifier
  status: "pending" | "processing" | "completed" | "failed";
  audioFileUrl: string; // URL of the audio file
  result?: string; // Transcription result
  error?: string; // Error message if failed
  webhookUrl?: string; // Callback URL
  createdAt: Date; // Creation timestamp
  updatedAt: Date; // Last update timestamp
}
```

### Error Handling

The package provides specific error classes for better error handling:

```typescript
import {
  SqliteError,
  SqliteInitializationError,
} from "@codigo/audio-transcription-storage";

try {
  const storage = await createSqliteStorage({ path: "./db.sqlite" });
  await storage.createJob(/* ... */);
} catch (error) {
  if (error instanceof SqliteInitializationError) {
    // Handle initialization errors:
    // - Missing SQLite installation
    // - Corrupt database file
    // - Permission issues
    console.error("Failed to initialize database:", error.message);
  } else if (error instanceof SqliteError) {
    // Handle operational errors:
    // - Failed queries
    // - Constraint violations
    // - Connection issues
    console.error("Database operation failed:", error.message);
  }
}
```

### Database Schema

The storage uses the following table schema:

```sql
CREATE TABLE transcription_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ),
  audio_file_url TEXT NOT NULL,
  result TEXT,
  error TEXT,
  webhook_url TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

### Performance Considerations

- Uses Write-Ahead Logging (WAL) mode for better concurrency
- Prepared statements for query optimization
- Indexes on frequently queried columns
- Automatic connection pooling

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
