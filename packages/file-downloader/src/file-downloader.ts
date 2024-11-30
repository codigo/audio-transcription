import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { fetch, Response as UndiciResponse } from "undici";
import { Readable } from "node:stream";
import type { FileDownloaderPort } from "@codigo/audio-transcription-core";

export interface FileDownloaderOptions {
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

export class FileDownloaderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "FileDownloaderError";
  }
}

const DEFAULT_OPTIONS: Required<Omit<FileDownloaderOptions, "headers">> = {
  timeout: 30000,
  maxFileSize: 25 * 1024 * 1024, // 25MB
};

const pipelineAsync = async (
  readable: NodeJS.ReadableStream,
  writable: NodeJS.WritableStream,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    readable.pipe(writable);
    writable.on("finish", resolve);
    writable.on("error", reject);
    readable.on("error", reject);
  });
};

export const createFileDownloader = (
  options: FileDownloaderOptions = {},
): FileDownloaderPort => {
  const config = { ...DEFAULT_OPTIONS, ...options };

  const downloadFile = async (url: string, destPath: string): Promise<void> => {
    let response: UndiciResponse | undefined;
    let writeStream: ReturnType<typeof createWriteStream> | undefined;
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), config.timeout);

      response = await fetch(url, {
        signal: controller.signal,
        headers: options.headers,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new FileDownloaderError(
          `HTTP error ${response.status}: ${response.statusText}`,
          "HTTP_ERROR",
        );
      }

      // Check content length if available
      const contentLength = parseInt(
        response.headers.get("content-length") ?? "0",
        10,
      );
      if (contentLength > config.maxFileSize) {
        throw new FileDownloaderError(
          `File size ${contentLength} exceeds maximum size of ${config.maxFileSize}`,
          "FILE_TOO_LARGE",
        );
      }

      // Create write stream
      writeStream = createWriteStream(destPath);

      const body = Readable.fromWeb(response.body!);
      let downloadedSize = 0;

      body.on("data", (chunk) => {
        downloadedSize += chunk.length;
        if (downloadedSize > config.maxFileSize) {
          body.destroy();
          writeStream?.destroy();
          throw new FileDownloaderError(
            `File size exceeds maximum size of ${config.maxFileSize}`,
            "FILE_TOO_LARGE",
          );
        }
      });

      await pipelineAsync(body, writeStream);

      if (downloadedSize === 0) {
        throw new FileDownloaderError("Empty response body", "EMPTY_RESPONSE");
      }
    } catch (error) {
      // Clean up the partial file if it exists
      try {
        await unlink(destPath);
      } catch {
        // Ignore cleanup errors
      }

      if (error instanceof FileDownloaderError) {
        throw error;
      }

      // Handle AbortError specifically for timeouts
      if (error instanceof Error && error.name === "AbortError") {
        throw new FileDownloaderError(
          "Download timeout exceeded",
          "TIMEOUT_ERROR",
          error,
        );
      }

      throw new FileDownloaderError(
        `Failed to download file: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DOWNLOAD_FAILED",
        error instanceof Error ? error : undefined,
      );
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (writeStream) {
        writeStream.destroy();
      }
    }
  };

  return { downloadFile };
};
