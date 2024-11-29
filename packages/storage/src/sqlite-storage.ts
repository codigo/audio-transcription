import Database from "better-sqlite3";
import type {
  StoragePort,
  TranscriptionJob,
} from "@codigo/audio-transcription-core";
import { migrate } from "./migrations/index.js";

export interface SqliteStorageOptions {
  path: string;
  /**
   * If true, runs migrations on creation
   * @default true
   */
  migrate?: boolean;
}

// Define type for SQLite errors
interface SqliteErrorWithCode extends Error {
  code?: string;
}

export class SqliteError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "SqliteError";
  }
}

export class SqliteInitializationError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "SqliteInitializationError";
  }
}

const parseJob = (row: any): TranscriptionJob => ({
  id: row.id,
  status: row.status,
  audioFileUrl: row.audio_file_url,
  result: row.result,
  error: row.error,
  webhookUrl: row.webhook_url,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const isSqliteError = (error: unknown): error is SqliteErrorWithCode => {
  return error instanceof Error && "code" in error;
};

export const createSqliteStorage = async (
  options: SqliteStorageOptions,
): Promise<StoragePort> => {
  let db: Database.Database;

  try {
    db = new Database(options.path);

    // Enable WAL mode and foreign keys immediately after opening connection
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Test the connection
    db.prepare("SELECT 1").get();

    if (options.migrate !== false) {
      await migrate(db);
    }

    // Only prepare statements if migrations are enabled or tables already exist
    let hasRequiredTables = false;

    // Check if required tables exist
    const tables = db
      .prepare(
        `
        SELECT name FROM sqlite_master
        WHERE type='table' AND name IN ('transcription_jobs')
      `,
      )
      .all();
    hasRequiredTables = tables.length === 1;

    if (!hasRequiredTables && options.migrate === false) {
      // Return minimal implementation that throws for all operations
      return {
        async createJob(): Promise<TranscriptionJob> {
          throw new SqliteError(
            "Database not initialized: no such table: transcription_jobs",
          );
        },
        async updateJob(): Promise<TranscriptionJob> {
          throw new SqliteError(
            "Database not initialized: no such table: transcription_jobs",
          );
        },
        async getJob(): Promise<TranscriptionJob | null> {
          throw new SqliteError(
            "Database not initialized: no such table: transcription_jobs",
          );
        },
        async close(): Promise<void> {
          db.close();
        },
      };
    }

    // Prepare statements only if tables exist
    const createJobStmt = db.prepare(`
      INSERT INTO transcription_jobs (
        id,
        status,
        audio_file_url,
        webhook_url,
        created_at,
        updated_at
      ) VALUES (
        lower(hex(randomblob(16))),
        @status,
        @audioFileUrl,
        @webhookUrl,
        strftime('%Y-%m-%d %H:%M:%f', 'now'),
        strftime('%Y-%m-%d %H:%M:%f', 'now')
      ) RETURNING *
    `);

    const updateJobStmt = db.prepare(`
      UPDATE transcription_jobs
      SET
        status = CASE WHEN @status IS NOT NULL THEN @status ELSE status END,
        result = CASE WHEN @result IS NOT NULL THEN @result ELSE result END,
        error = CASE WHEN @error IS NOT NULL THEN @error ELSE error END,
        webhook_url = CASE WHEN @webhookUrl IS NOT NULL THEN @webhookUrl ELSE webhook_url END,
        updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now')
      WHERE id = @id
      RETURNING *
    `);

    const getJobStmt = db.prepare(`
      SELECT * FROM transcription_jobs WHERE id = @id
    `);

    // Helper to check if a job exists
    const checkJobExistsStmt = db.prepare(`
      SELECT 1 FROM transcription_jobs WHERE id = @id
    `);

    const storage = {
      async createJob(job: TranscriptionJob): Promise<TranscriptionJob> {
        try {
          const row = createJobStmt.get({
            status: job.status,
            audioFileUrl: job.audioFileUrl,
            webhookUrl: job.webhookUrl,
          });

          return parseJob(row);
        } catch (err) {
          let error = err as Error;
          throw new SqliteError("Failed to create job", error);
        }
      },

      async updateJob(
        id: string,
        update: Partial<TranscriptionJob>,
      ): Promise<TranscriptionJob> {
        try {
          // First check if job exists
          const exists = checkJobExistsStmt.get({ id });
          if (!exists) {
            throw new Error(`Job with id ${id} not found`);
          }

          const row = updateJobStmt.get({
            id,
            status: update.status ?? null,
            result: update.result ?? null,
            error: update.error ?? null,
            webhookUrl: update.webhookUrl ?? null,
          });

          return parseJob(row);
        } catch (err) {
          let error = err as Error;
          if (error.message.includes("not found")) {
            throw error; // Re-throw the "not found" error directly
          }
          throw new SqliteError("Failed to update job", error);
        }
      },

      async getJob(id: string): Promise<TranscriptionJob | null> {
        try {
          const row = getJobStmt.get({ id });
          return row ? parseJob(row) : null;
        } catch (err) {
          let error = err as Error;
          throw new SqliteError("Failed to get job", error);
        }
      },

      async close(): Promise<void> {
        try {
          if (db.open) {
            db.close();
          }
        } catch (err) {
          let error = err as Error;
          throw new SqliteError("Failed to close database connection", error);
        }
      },
    };

    // Expose db instance for testing
    Object.defineProperty(storage, "db", {
      enumerable: false,
      configurable: false,
      get: () => db,
    });

    return storage;
  } catch (error: unknown) {
    if (isSqliteError(error)) {
      if (error.code === "SQLITE_NOTADB") {
        throw new SqliteInitializationError(
          "Invalid database file. The file might be corrupted or not a SQLite database.",
          error,
        );
      }

      // Handle better-sqlite3 initialization errors
      if (error.message.includes("not found")) {
        throw new SqliteInitializationError(
          "SQLite3 installation not found. Please install SQLite3 development files:\n" +
            "- Ubuntu/Debian: sudo apt-get install sqlite3 libsqlite3-dev\n" +
            "- macOS: brew install sqlite3\n" +
            "- Windows: npm install --global windows-build-tools",
          error,
        );
      }
    }

    // If it's an Error but not a SQLite error, or some other unknown error
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    throw new SqliteInitializationError(
      "Failed to initialize SQLite database: " + errorMessage,
      error instanceof Error ? error : undefined,
    );
  }
};
