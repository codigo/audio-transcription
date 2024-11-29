# @codigo/audio-transcription-storage

SQLite storage implementation for the audio transcription service.

## Installation

```bash
npm install @codigo/audio-transcription-storage
```

## Usage

The storage package provides a SQLite implementation of the `StoragePort` interface for persisting transcription jobs.

### Basic Usage

```typescript
import { createSqliteStorage } from "@codigo/audio-transcription-storage";
// Initialize the storage
const storage = await createSqliteStorage({
  path: "./transcriptions.db",
  migrate: true, // runs migrations automatically (default: true)
});
// Create a new transcription job
const job = await storage.createJob({
  status: "pending",
  audioFileUrl: "https://example.com/audio.mp3",
  webhookUrl: "https://example.com/webhook",
});
// Get a job by ID
const retrievedJob = await storage.getJob(job.id);
// Update a job
const updatedJob = await storage.updateJob(job.id, {
  status: "completed",
  result: "Transcription text here",
});
// Close the connection when done
await storage.close();
```

### API Reference

#### `createSqliteStorage(options: SqliteStorageOptions): Promise<StoragePort>`

Creates a new SQLite storage instance.

Options:

- `path`: Path to the SQLite database file
- `migrate`: Whether to run migrations on creation (default: true)

Returns a `StoragePort` instance with the following methods:

#### `createJob(job: TranscriptionJob): Promise<TranscriptionJob>`

Creates a new transcription job in the database.

#### `getJob(id: string): Promise<TranscriptionJob | null>`

Retrieves a job by its ID. Returns null if not found.

#### `updateJob(id: string, update: Partial<TranscriptionJob>): Promise<TranscriptionJob>`

Updates an existing job. Throws an error if the job doesn't exist.

#### `close(): Promise<void>`

Closes the database connection.

### TranscriptionJob Interface

```typescript
interface TranscriptionJob {
  id: string;
  status: string;
  audioFileUrl: string;
  result?: string;
  error?: string;
  webhookUrl?: string;
  createdAt: Date;
  updatedAt: Date;
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
} catch (error) {
  if (error instanceof SqliteInitializationError) {
    // Handle initialization errors (missing SQLite, corrupt DB file, etc.)
  } else if (error instanceof SqliteError) {
    // Handle operational errors
  }
}
```

## Development

### Prerequisites

- SQLite3 development files:
  - Ubuntu/Debian: `sudo apt-get install sqlite3 libsqlite3-dev`
  - macOS: `brew install sqlite3`
  - Windows: `npm install --global windows-build-tools`

### Running Tests

```bash
npm test
```

## License

MIT
