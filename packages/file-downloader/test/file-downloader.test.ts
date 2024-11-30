import t from "tap";
import { join } from "path";
import { mkdtemp, readFile, stat, rm } from "fs/promises";
import { tmpdir } from "os";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import {
  createFileDownloader,
  FileDownloaderError,
} from "../src/file-downloader.js";

const BASE_URL = "https://example.com";

t.test("FileDownloader", async (t) => {
  let tempDir: string;
  let mockAgent: MockAgent;
  let mockPool: ReturnType<MockAgent["get"]>;
  const originalDispatcher = getGlobalDispatcher();

  t.beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "file-downloader-test-"));
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    mockPool = mockAgent.get(BASE_URL);
  });

  t.afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await mockPool.close();
    await mockAgent.close();
    setGlobalDispatcher(originalDispatcher);
  });

  t.test("should download file successfully", async (t) => {
    const fileContent = "test content";
    const destPath = join(tempDir, "test.txt");

    mockPool
      .intercept({
        path: "/test.txt",
        method: "GET",
      })
      .reply(200, fileContent, {
        headers: {
          "Content-Length": fileContent.length.toString(),
        },
      });

    const downloader = createFileDownloader();
    await downloader.downloadFile(`${BASE_URL}/test.txt`, destPath);

    const content = await readFile(destPath, "utf-8");
    t.equal(content, fileContent);
  });

  t.test("should handle HTTP errors", async (t) => {
    const destPath = join(tempDir, "test.txt");

    mockPool
      .intercept({
        path: "/test.txt",
        method: "GET",
      })
      .reply(404, "Not Found");

    const downloader = createFileDownloader();

    try {
      await downloader.downloadFile(`${BASE_URL}/test.txt`, destPath);
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
    const fileContent = Buffer.alloc(200).fill("a"); // Create content larger than limit
    const destPath = join(tempDir, "test.txt");

    mockPool
      .intercept({
        path: "/test.txt",
        method: "GET",
      })
      .reply(200, fileContent, {
        headers: {
          "Content-Length": fileContent.length.toString(),
        },
      });

    const downloader = createFileDownloader({
      maxFileSize: 100, // Small limit for testing
    });

    try {
      await downloader.downloadFile(`${BASE_URL}/test.txt`, destPath);
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

  t.test("should respect custom headers", async (t) => {
    const fileContent = "test content";
    const destPath = join(tempDir, "test.txt");

    mockPool
      .intercept({
        path: "/test.txt",
        method: "GET",
        headers: {
          "x-custom-header": "custom-value",
        },
      })
      .reply(200, fileContent);

    const downloader = createFileDownloader({
      headers: {
        "X-Custom-Header": "custom-value",
      },
    });

    await downloader.downloadFile(`${BASE_URL}/test.txt`, destPath);
    t.pass("Request with custom header was successful");
  });

  t.test("should handle timeout", async (t) => {
    const destPath = join(tempDir, "test.txt");

    mockPool
      .intercept({
        path: "/test.txt",
        method: "GET",
      })
      .reply(200, "test content")
      .delay(2000); // 2 second delay

    const downloader = createFileDownloader({
      timeout: 1000, // 1 second timeout
    });

    try {
      await downloader.downloadFile(`${BASE_URL}/test.txt`, destPath);
      t.fail("Should have thrown a timeout error");
    } catch (error) {
      t.ok(error instanceof FileDownloaderError);
      t.equal(error.code, "TIMEOUT_ERROR");
    }
  });

  t.test("should handle empty response body", async (t) => {
    const destPath = join(tempDir, "test.txt");

    mockPool
      .intercept({
        path: "/test.txt",
        method: "GET",
      })
      .reply(200, ""); // Empty response

    const downloader = createFileDownloader();

    try {
      await downloader.downloadFile(`${BASE_URL}/test.txt`, destPath);
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof FileDownloaderError);
      t.equal(error.code, "EMPTY_RESPONSE");
    }
  });

  t.test("should handle write stream errors", async (t) => {
    const destPath = join(tempDir, "nonexistent/test.txt"); // Invalid path to trigger write error
    const fileContent = "test content";

    mockPool
      .intercept({
        path: "/test.txt",
        method: "GET",
      })
      .reply(200, fileContent);

    const downloader = createFileDownloader();

    try {
      await downloader.downloadFile(`${BASE_URL}/test.txt`, destPath);
      t.fail("Should have thrown an error");
    } catch (error) {
      t.ok(error instanceof FileDownloaderError);
      t.equal(error.code, "DOWNLOAD_FAILED");
      t.match(error.message, /ENOENT/i, "Should contain file system error");
    }
  });
});
