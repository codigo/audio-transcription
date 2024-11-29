import t from "tap";
import { join } from "path";
import { mkdtemp, readFile, stat, rm } from "fs/promises";
import { tmpdir } from "os";
import nock from "nock";
import {
  createFileDownloader,
  FileDownloaderError,
} from "../src/file-downloader.js";
import { Readable } from "node:stream";

// Disable real network requests
nock.disableNetConnect();

t.test("FileDownloader", async (t) => {
  let tempDir: string;

  t.beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "file-downloader-test-"));
  });

  t.afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    nock.cleanAll();
  });

  t.test("should download file successfully", async (t) => {
    const fileContent = "test content";
    const destPath = join(tempDir, "test.txt");

    nock("https://example.com").get("/test.txt").reply(200, fileContent, {
      "Content-Length": fileContent.length.toString(),
    });

    const downloader = createFileDownloader();
    await downloader.downloadFile("https://example.com/test.txt", destPath);

    const content = await readFile(destPath, "utf-8");
    t.equal(content, fileContent);
  });

  t.test("should handle HTTP errors", async (t) => {
    const destPath = join(tempDir, "test.txt");

    nock("https://example.com").get("/test.txt").reply(404);

    const downloader = createFileDownloader();

    try {
      await downloader.downloadFile("https://example.com/test.txt", destPath);
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof FileDownloaderError);
      t.equal(error.code, "HTTP_ERROR");

      // Verify file was cleaned up
      try {
        await stat(destPath);
        t.fail("File should have been cleaned up");
      } catch {
        t.pass("File was cleaned up");
      }
    }
  });

  t.test("should handle file size limits", async (t) => {
    const fileContent = "test content";
    const destPath = join(tempDir, "test.txt");

    nock("https://example.com").get("/test.txt").reply(200, fileContent, {
      "Content-Length": "1000000", // Larger than our test limit
    });

    const downloader = createFileDownloader({
      maxFileSize: 100, // Small limit for testing
    });

    try {
      await downloader.downloadFile("https://example.com/test.txt", destPath);
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof FileDownloaderError);
      t.equal(error.code, "FILE_TOO_LARGE");

      // Verify file was cleaned up
      try {
        await stat(destPath);
        t.fail("File should have been cleaned up");
      } catch {
        t.pass("File was cleaned up");
      }
    }
  });

  t.test("should handle stream errors", async (t) => {
    const destPath = join(tempDir, "test.txt");

    nock("https://example.com")
      .get("/test.txt")
      .replyWithError("Network error");

    const downloader = createFileDownloader();

    try {
      await downloader.downloadFile("https://example.com/test.txt", destPath);
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof FileDownloaderError);
      t.match(error.message, /Network error/);

      // Verify file was cleaned up
      try {
        await stat(destPath);
        t.fail("File should have been cleaned up");
      } catch {
        t.pass("File was cleaned up");
      }
    }
  });

  t.test("should respect custom headers", async (t) => {
    const fileContent = "test content";
    const destPath = join(tempDir, "test.txt");

    const scope = nock("https://example.com")
      .matchHeader("X-Custom-Header", "custom-value")
      .get("/test.txt")
      .reply(200, fileContent);

    const downloader = createFileDownloader({
      headers: {
        "X-Custom-Header": "custom-value",
      },
    });

    await downloader.downloadFile("https://example.com/test.txt", destPath);
    t.ok(scope.isDone(), "Request was made with custom header");
  });

  t.test("should handle timeout", async (t) => {
    const destPath = join(tempDir, "test.txt");

    nock("https://example.com")
      .get("/test.txt")
      .delay(2000) // 2 second delay
      .reply(200, "test content");

    const downloader = createFileDownloader({
      timeout: 1000, // 1 second timeout
    });

    try {
      await downloader.downloadFile("https://example.com/test.txt", destPath);
      t.fail("Should have thrown a timeout error");
    } catch (error) {
      t.ok(error instanceof FileDownloaderError);
      t.match(error.message, /timeout/i);
    }
  });

  t.test("should handle empty response body", async (t) => {
    const destPath = join(tempDir, "test.txt");

    nock("https://example.com")
      .get("/test.txt")
      .reply(200, () => {
        return new Readable({
          read() {
            // Immediately signal end of stream without pushing any data
            this.push(null);
          },
        });
      });

    const downloader = createFileDownloader();

    try {
      await downloader.downloadFile("https://example.com/test.txt", destPath);
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof FileDownloaderError);
      t.equal(error.code, "EMPTY_RESPONSE");
    }
  });

  t.test("should handle write stream errors", async (t) => {
    const destPath = join(tempDir, "nonexistent/test.txt"); // Invalid path to trigger write error
    const fileContent = "test content";

    nock("https://example.com").get("/test.txt").reply(200, fileContent);

    const downloader = createFileDownloader();

    try {
      await downloader.downloadFile("https://example.com/test.txt", destPath);
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof FileDownloaderError);
      t.equal(error.code, "WRITE_ERROR");
    }
  });

  t.test("should handle stream errors during download", async (t) => {
    const destPath = join(tempDir, "test.txt");

    // Create a response that will emit an error during streaming
    nock("https://example.com")
      .get("/test.txt")
      .reply(200, () => {
        const stream = new Readable({
          read() {
            this.emit("error", new Error("Stream error"));
          },
        });
        return stream;
      });

    const downloader = createFileDownloader();

    try {
      await downloader.downloadFile("https://example.com/test.txt", destPath);
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof FileDownloaderError);
      t.equal(error.code, "STREAM_ERROR");
      t.match(error.message, /Stream error/);
    }
  });

  t.test("should handle dynamic file size check", async (t) => {
    const destPath = join(tempDir, "test.txt");
    const largeContent = Buffer.alloc(200).fill("a"); // Create content larger than limit

    // Create a readable stream that will emit the large content in smaller chunks
    nock("https://example.com")
      .get("/test.txt")
      .reply(200, () => {
        let sent = false;
        return new Readable({
          read() {
            if (!sent) {
              sent = true;
              // Send the content in chunks to trigger the size check
              const chunk = Buffer.alloc(150).fill("a");
              this.push(chunk);
              // Send another chunk to exceed the limit
              this.push(chunk);
            } else {
              this.push(null); // End the stream
            }
          },
        });
      });

    const downloader = createFileDownloader({
      maxFileSize: 100, // Small limit for testing
    });

    try {
      await downloader.downloadFile("https://example.com/test.txt", destPath);
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof FileDownloaderError);
      t.equal(error.code, "FILE_TOO_LARGE");

      // Verify file was cleaned up
      try {
        await stat(destPath);
        t.fail("File should have been cleaned up");
      } catch {
        t.pass("File was cleaned up");
      }
    }
  });
});
