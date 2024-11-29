import type Database from "better-sqlite3";

const MIGRATIONS = [
  // 001 - Initial schema
  `
    -- First create schema_migrations table
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Then create transcription_jobs table
    CREATE TABLE IF NOT EXISTS transcription_jobs (
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

    CREATE INDEX IF NOT EXISTS idx_transcription_jobs_status
    ON transcription_jobs(status);

    CREATE INDEX IF NOT EXISTS idx_transcription_jobs_created_at
    ON transcription_jobs(created_at);
  `,
];

export const migrate = async (db: Database.Database): Promise<void> => {
  // Run everything in a transaction
  const runMigrations = db.transaction(() => {
    // Create migrations table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get last applied migration
    const lastMigration = db
      .prepare(
        `
      SELECT version FROM schema_migrations
      ORDER BY version DESC LIMIT 1
    `,
      )
      .get() as { version: number } | undefined;

    const currentVersion = lastMigration?.version ?? 0;

    // Only apply new migrations
    const pendingMigrations = MIGRATIONS.slice(currentVersion);

    for (const [index, migration] of pendingMigrations.entries()) {
      const version = currentVersion + index + 1;
      db.exec(migration);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(
        version,
      );
    }
  });

  // Execute the transaction
  runMigrations();
};
