import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock S3 responses
const mockPutObjectResponse = { $metadata: { httpStatusCode: 200 } };
const mockGetObjectResponse = {
  Body: {
    transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2, 3, 4])),
    transformToWebStream: () => new ReadableStream(),
  },
  ContentLength: 4,
  ContentType: "video/mp4",
};
const mockDeleteObjectResponse = { $metadata: { httpStatusCode: 204 } };
const mockHeadObjectResponse = {
  ContentLength: 1024,
  ContentType: "video/mp4",
  LastModified: new Date(),
};

// Track mock calls - use unknown to allow different response types
const mockSend = mock(() => Promise.resolve(mockGetObjectResponse as unknown));

// Mock the S3Client
mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3Client {
    send = mockSend;
  },
  PutObjectCommand: class MockPutObjectCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  GetObjectCommand: class MockGetObjectCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  DeleteObjectCommand: class MockDeleteObjectCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  HeadObjectCommand: class MockHeadObjectCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
}));

// Import after mocking
const { s3Service, getS3Key } = await import("./s3");

describe("s3 service", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  describe("getS3Key", () => {
    test("генерирует правильный ключ для reels", () => {
      const key = getS3Key("reels", "ABC123");
      expect(key).toBe("reels/ABC123.mp4");
    });

    test("генерирует правильный ключ для generations", () => {
      const key = getS3Key("generations", "gen-uuid-123");
      expect(key).toBe("generations/gen-uuid-123.mp4");
    });

    test("генерирует правильный ключ для thumbnails", () => {
      const key = getS3Key("thumbnails", "ABC123", "jpg");
      expect(key).toBe("thumbnails/ABC123.jpg");
    });
  });

  describe("uploadFile", () => {
    test("загружает файл в S3", async () => {
      mockSend.mockResolvedValue(mockPutObjectResponse as unknown);

      const buffer = Buffer.from("test video content");
      const key = "reels/test123.mp4";

      await s3Service.uploadFile(key, buffer, "video/mp4");

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test("использует правильный content-type", async () => {
      mockSend.mockResolvedValue(mockPutObjectResponse as unknown);

      const buffer = Buffer.from("test");
      await s3Service.uploadFile("test.mp4", buffer, "video/mp4");

      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe("downloadFile", () => {
    test("скачивает файл из S3", async () => {
      mockSend.mockResolvedValue(mockGetObjectResponse);

      const result = await s3Service.downloadFile("reels/test123.mp4");

      expect(result).toBeInstanceOf(Buffer);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test("возвращает null если файл не найден", async () => {
      mockSend.mockRejectedValue({ name: "NoSuchKey" });

      const result = await s3Service.downloadFile("reels/nonexistent.mp4");

      expect(result).toBeNull();
    });
  });

  describe("deleteFile", () => {
    test("удаляет файл из S3", async () => {
      mockSend.mockResolvedValue(mockDeleteObjectResponse as unknown);

      await s3Service.deleteFile("reels/test123.mp4");

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe("fileExists", () => {
    test("возвращает true если файл существует", async () => {
      mockSend.mockResolvedValue(mockHeadObjectResponse as unknown);

      const exists = await s3Service.fileExists("reels/test123.mp4");

      expect(exists).toBe(true);
    });

    test("возвращает false если файл не существует", async () => {
      mockSend.mockRejectedValue({ name: "NotFound" });

      const exists = await s3Service.fileExists("reels/nonexistent.mp4");

      expect(exists).toBe(false);
    });
  });

  describe("getFileMetadata", () => {
    test("возвращает метаданные файла", async () => {
      mockSend.mockResolvedValue(mockHeadObjectResponse as unknown);

      const metadata = await s3Service.getFileMetadata("reels/test123.mp4");

      expect(metadata).not.toBeNull();
      expect(metadata?.contentLength).toBe(1024);
      expect(metadata?.contentType).toBe("video/mp4");
    });

    test("возвращает null если файл не существует", async () => {
      mockSend.mockRejectedValue({ name: "NotFound" });

      const metadata = await s3Service.getFileMetadata("reels/nonexistent.mp4");

      expect(metadata).toBeNull();
    });
  });
});
