import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import fetch, { Response } from "node-fetch";
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

export const createFileDownloader = (
  options: FileDownloaderOptions = {},
): FileDownloaderPort => {
  const config = { ...DEFAULT_OPTIONS, ...options };

  const downloadFile = async (url: string, destPath: string): Promise<void> => {
    let response: Response | undefined;
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

      let downloadedSize = 0;

      await new Promise<void>((resolve, reject) => {
        if (!response?.body) {
          reject(new FileDownloaderError("No response body", "EMPTY_RESPONSE"));
          return;
        }

        let hasError = false;
        let hasReceivedData = false;

        response.body.on("data", (chunk) => {
          if (hasError) return; // Skip if we already have an error

          hasReceivedData = true;
          downloadedSize += chunk.length;
          if (downloadedSize > config.maxFileSize) {
            hasError = true;
            controller.abort();
            reject(
              new FileDownloaderError(
                `File size exceeds maximum size of ${config.maxFileSize}`,
                "FILE_TOO_LARGE",
              ),
            );
            return;
          }
        });

        response.body.on("end", () => {
          if (!hasReceivedData && !hasError) {
            hasError = true;
            reject(
              new FileDownloaderError("Empty response body", "EMPTY_RESPONSE"),
            );
            return;
          }
        });

        response.body.on("error", (error) => {
          if (hasError) return; // Skip if we already have an error

          hasError = true;
          reject(
            new FileDownloaderError(
              `Download stream error: ${error.message}`,
              "STREAM_ERROR",
              error,
            ),
          );
        });

        writeStream!.on("error", (error) => {
          if (hasError) return; // Skip if we already have an error

          hasError = true;
          reject(
            new FileDownloaderError(
              `Write stream error: ${error.message}`,
              "WRITE_ERROR",
              error,
            ),
          );
        });

        writeStream!.on("finish", () => {
          if (!hasError) {
            resolve();
          }
        });

        response.body.pipe(writeStream!);
      });
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
      // Clear timeout if it exists
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Ensure streams are properly closed in the correct order
      if (writeStream) {
        try {
          // First unpipe to prevent any more writes
          if (response?.body) {
            response.body.unpipe(writeStream);
          }
          // Then remove listeners and destroy
          writeStream.removeAllListeners();
          writeStream.destroy();
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      // Finally clean up the response body
      if (response?.body) {
        try {
          const body = response.body as unknown as Readable;
          body.removeAllListeners();
          body.destroy();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  };

  return { downloadFile };
};
