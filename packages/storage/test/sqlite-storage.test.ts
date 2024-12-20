import t from "tap";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import Database from "better-sqlite3";
import { writeFileSync } from "fs";
import {
  createSqliteStorage,
  SqliteInitializationError,
  SqliteError,
} from "../src/sqlite-storage.js";
import type {
  TranscriptionJob,
  StoragePort,
} from "@codigo/audio-transcription-core";

// Add this type near the top of the file with other imports/types
type SqliteStorageWithDb = StoragePort & {
  db: Database.Database;
};

// Helper to get random test DB path
const getTestDbPath = (): string =>
  join(tmpdir(), `test-${randomBytes(8).toString("hex")}.db`);

// Sample job data with required fields
const sampleJob: TranscriptionJob = {
  id: "", // Will be generated by SQLite
  status: "pending",
  audioFileUrl: "https://example.com/audio.mp3",
  webhookUrl: "https://example.com/webhook",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Test initialization scenarios
t.test("initialization", async (t) => {
  t.test("successfully creates new database", async (t) => {
    const dbPath = getTestDbPath();
    const storage = await createSqliteStorage({ path: dbPath });
    t.ok(storage, "storage instance created");

    // Verify database was initialized with correct schema
    const db = new Database(dbPath);
    const tables = db
      .prepare(
        `
      SELECT name FROM sqlite_master
      WHERE type='table'
      ORDER BY name
    `,
      )
      .all();

    t.same(
      tables.map((row: unknown) => (row as { name: string }).name).sort(),
      ["schema_migrations", "transcription_jobs"].sort(),
      "creates expected tables",
    );

    db.close();
    await storage.close();
  });

  t.test("handles invalid database file", async (t) => {
    await t.rejects(
      createSqliteStorage({ path: "/invalid/path/db.sqlite" }),
      SqliteInitializationError,
      "throws SqliteInitializationError for invalid path",
    );
  });

  t.test("handles corrupted database", async (t) => {
    const dbPath = getTestDbPath();
    // Create corrupted DB file
    writeFileSync(dbPath, "not a sqlite database");

    await t.rejects(
      createSqliteStorage({ path: dbPath }),
      SqliteInitializationError,
      "throws SqliteInitializationError for corrupted database",
    );
  });

  t.test("respects migrate option", async (t) => {
    const dbPath = getTestDbPath();

    // Create storage without migrations
    const storage = await createSqliteStorage({
      path: dbPath,
      migrate: false,
    });

    // Should fail because table doesn't exist
    await t.rejects(
      storage.createJob(sampleJob as TranscriptionJob),
      /no such table: transcription_jobs/,
      "operations fail without migrations",
    );

    await storage.close();
  });

  t.test("handles SQLite installation issues", async (t) => {
    // Mock error that would occur when SQLite is not installed
    const originalPrepare = Database.prototype.prepare;
    Database.prototype.prepare = function (): never {
      const error = new Error("not found") as Error & { code: string };
      error.code = "SQLITE_ERROR";
      throw error;
    };

    await t.rejects(
      createSqliteStorage({ path: getTestDbPath() }),
      /SQLite3 installation not found/,
      "throws helpful error when SQLite is not installed",
    );

    // Restore original prepare method
    Database.prototype.prepare = originalPrepare;
  });

  t.test("handles unknown errors", async (t) => {
    // Mock unknown error
    const originalPrepare = Database.prototype.prepare;
    Database.prototype.prepare = function (): never {
      throw new Error("Unknown error");
    };

    await t.rejects(
      createSqliteStorage({ path: getTestDbPath() }),
      /Failed to initialize SQLite database: Unknown error/,
      "throws initialization error for unknown errors",
    );

    // Restore original prepare method
    Database.prototype.prepare = originalPrepare;
  });

  t.test("handles non-Error objects", async (t) => {
    // Mock throwing a non-Error object
    const originalPrepare = Database.prototype.prepare;
    Database.prototype.prepare = function (): never {
      throw "string error"; // Not an Error object
    };

    await t.rejects(
      createSqliteStorage({ path: getTestDbPath() }),
      /Failed to initialize SQLite database: Unknown error occurred/,
      "handles non-Error throws",
    );

    // Restore original prepare method
    Database.prototype.prepare = originalPrepare;
  });
});

// Test CRUD operations
t.test("job operations", async (t) => {
  const dbPath = getTestDbPath();
  const storage = await createSqliteStorage({ path: dbPath });

  t.beforeEach(async () => {
    // Clean up existing data
    const db = new Database(dbPath);
    db.prepare("DELETE FROM transcription_jobs").run();
    db.close();
  });

  t.test("createJob", async (t) => {
    const job = await storage.createJob(sampleJob);

    t.match(
      job,
      {
        id: /^[0-9a-f]{32}$/, // Verify UUID format
        status: sampleJob.status,
        audioFileUrl: sampleJob.audioFileUrl,
        webhookUrl: sampleJob.webhookUrl,
      },
      "creates job with expected fields",
    );

    t.ok(job.createdAt instanceof Date, "sets createdAt date");
    t.ok(job.updatedAt instanceof Date, "sets updatedAt date");
    t.equal(
      job.createdAt.getTime(),
      job.updatedAt.getTime(),
      "createdAt equals updatedAt on creation",
    );
  });

  t.test("updateJob", async (t) => {
    // Test basic updates
    t.test("handles basic updates", async (t) => {
      const created = await storage.createJob(sampleJob);
      const initialUpdatedAt = created.updatedAt;

      // Wait a moment to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const update = {
        status: "completed" as const,
        result: "transcription result",
        webhookUrl: "https://example.com/new-webhook",
      };

      const updated = await storage.updateJob(created.id, update);

      t.equal(updated.status, update.status, "updates status");
      t.equal(updated.result, update.result, "updates result");
      t.equal(updated.webhookUrl, update.webhookUrl, "updates webhookUrl");
      t.ok(updated.updatedAt > initialUpdatedAt, "updates updatedAt timestamp");
      t.equal(
        updated.createdAt.getTime(),
        created.createdAt.getTime(),
        "preserves createdAt",
      );
    });

    // Test partial updates
    t.test("handles partial updates", async (t) => {
      const created = await storage.createJob(sampleJob);
      const partialUpdate = { status: "failed" as const };
      const partiallyUpdated = await storage.updateJob(
        created.id,
        partialUpdate,
      );
      t.equal(partiallyUpdated.status, "failed", "applies partial update");
    });

    // Test undefined values
    t.test("handles undefined values", async (t) => {
      const created = await storage.createJob(sampleJob);
      const updateWithUndefined = {
        status: undefined,
        result: "some result",
      };

      const updatedWithUndefined = await storage.updateJob(
        created.id,
        updateWithUndefined,
      );
      t.equal(
        updatedWithUndefined.status,
        sampleJob.status,
        "preserves original status when update is undefined",
      );
      t.equal(
        updatedWithUndefined.result,
        "some result",
        "updates other fields normally",
      );
    });

    // Test nonexistent job
    t.test("handles nonexistent job", async (t) => {
      await t.rejects(
        storage.updateJob("nonexistent-id", { status: "completed" as const }),
        /Job with id nonexistent-id not found/,
        "throws error for nonexistent job",
      );
    });
  });

  t.test("getJob", async (t) => {
    const created = await storage.createJob(sampleJob);
    const retrieved = await storage.getJob(created.id);

    t.ok(retrieved, "retrieves job");
    t.same(retrieved, created, "retrieves exact job data");

    const nonexistent = await storage.getJob("nonexistent-id");
    t.equal(nonexistent, null, "returns null for nonexistent job");
  });

  t.test("error handling", async (t) => {
    // Corrupt database to test error handling
    const db = new Database(dbPath);
    db.exec("DROP TABLE transcription_jobs");
    db.close();

    await t.rejects(
      storage.createJob(sampleJob),
      SqliteError,
      "handles database errors in createJob",
    );

    await t.rejects(
      storage.getJob("some-id"),
      SqliteError,
      "handles database errors in getJob",
    );

    await t.rejects(
      storage.updateJob("some-id", { status: "completed" as const }),
      SqliteError,
      "handles database errors in updateJob",
    );
  });

  // Cleanup
  t.teardown(async () => {
    await storage.close();
  });
});

// Test migrations
t.test("migrations", async (t) => {
  t.test("handles empty database", async (t) => {
    const dbPath = getTestDbPath();
    const storage = await createSqliteStorage({ path: dbPath });

    // Verify migrations table exists and has correct version
    const db = new Database(dbPath);
    const migrations = db
      .prepare("SELECT * FROM schema_migrations ORDER BY version")
      .all();

    t.equal(migrations.length, 1, "applies initial migration");
    t.equal(
      (migrations[0] as { version: number }).version,
      1,
      "records migration version",
    );

    db.close();
    await storage.close();
  });

  t.test("skips existing migrations", async (t) => {
    const dbPath = getTestDbPath();

    // Create DB and apply migrations
    let storage = await createSqliteStorage({ path: dbPath });
    await storage.close();

    // Create new storage instance - should not reapply migrations
    storage = await createSqliteStorage({ path: dbPath });

    const db = new Database(dbPath);
    const migrations = db
      .prepare("SELECT * FROM schema_migrations ORDER BY version")
      .all();

    t.equal(migrations.length, 1, "does not reapply migrations");

    db.close();
    await storage.close();
  });

  t.test("handles migration errors", async (t) => {
    const dbPath = getTestDbPath();
    const db = new Database(dbPath);

    // Create invalid schema_migrations table to cause error
    db.exec(`
      CREATE TABLE schema_migrations (
        invalid INTEGER
      );
      INSERT INTO schema_migrations (invalid) VALUES (1);
    `);
    db.close();

    await t.rejects(
      createSqliteStorage({ path: dbPath }),
      SqliteInitializationError,
      "handles errors during migration",
    );
  });
});

// Test error handling in operations
t.test("operation errors", async (t) => {
  const dbPath = getTestDbPath();
  const storage = await createSqliteStorage({ path: dbPath });

  t.test("handles close errors", async (t) => {
    // Cast to the specific type instead of any
    const storageWithDb = storage as SqliteStorageWithDb;
    const db = storageWithDb.db;

    // Save original close method
    const originalClose = db.close;

    // Replace close method with one that throws
    db.close = (): never => {
      throw new Error("Simulated close error");
    };

    try {
      await t.rejects(
        storage.close(),
        {
          name: "SqliteError",
          message: "Failed to close database connection",
        },
        "handles errors when closing",
      );
    } finally {
      // Restore original close method and cleanup
      db.close = originalClose;
      db.close();
    }
  });
});
