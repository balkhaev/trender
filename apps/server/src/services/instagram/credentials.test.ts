import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock cookies для тестов (полная структура Playwright Cookie)
const mockCookies = [
  {
    name: "sessionid",
    value: "test123",
    domain: ".instagram.com",
    path: "/",
    expires: -1,
    httpOnly: true,
    secure: true,
    sameSite: "Lax" as const,
  },
  {
    name: "csrftoken",
    value: "csrf123",
    domain: ".instagram.com",
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: true,
    sameSite: "Lax" as const,
  },
];

const mockState = {
  cookies: mockCookies,
  origins: [] as Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>,
};

// Мок базы данных
const mockCredentials = {
  id: "test-id",
  cookies: mockCookies,
  state: mockState,
  createdAt: new Date(),
  updatedAt: new Date(),
  isActive: true,
};

const mockPrisma = {
  instagramCredentials: {
    findFirst: mock(() =>
      Promise.resolve(null as typeof mockCredentials | null)
    ),
    create: mock(() => Promise.resolve(mockCredentials)),
    update: mock(() => Promise.resolve(mockCredentials)),
  },
};

// Мокаем модуль базы данных
mock.module("@trender/db", () => ({
  default: mockPrisma,
}));

// Импортируем после мока
const { getActiveCredentials, saveCookies, saveState } = await import(
  "./credentials"
);

describe("credentials service", () => {
  beforeEach(() => {
    mockPrisma.instagramCredentials.findFirst.mockReset();
    mockPrisma.instagramCredentials.create.mockReset();
    mockPrisma.instagramCredentials.update.mockReset();
  });

  describe("getActiveCredentials", () => {
    test("возвращает null если нет активных credentials", async () => {
      mockPrisma.instagramCredentials.findFirst.mockResolvedValue(null);

      const result = await getActiveCredentials();

      expect(result).toBeNull();
      expect(mockPrisma.instagramCredentials.findFirst).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { updatedAt: "desc" },
      });
    });

    test("возвращает активные credentials", async () => {
      mockPrisma.instagramCredentials.findFirst.mockResolvedValue(
        mockCredentials
      );

      const result = await getActiveCredentials();

      expect(result?.id).toBe(mockCredentials.id);
      expect(result?.isActive).toBe(true);
    });
  });

  describe("saveCookies", () => {
    test("создаёт новые credentials если их нет", async () => {
      mockPrisma.instagramCredentials.findFirst.mockResolvedValue(null);
      mockPrisma.instagramCredentials.create.mockResolvedValue(mockCredentials);

      const result = await saveCookies(mockCookies);

      expect(mockPrisma.instagramCredentials.create).toHaveBeenCalled();
      expect(result.id).toBe(mockCredentials.id);
    });

    test("обновляет существующие credentials", async () => {
      mockPrisma.instagramCredentials.findFirst.mockResolvedValue(
        mockCredentials
      );
      mockPrisma.instagramCredentials.update.mockResolvedValue(mockCredentials);

      const result = await saveCookies(mockCookies);

      expect(mockPrisma.instagramCredentials.update).toHaveBeenCalled();
      expect(result.id).toBe(mockCredentials.id);
    });
  });

  describe("saveState", () => {
    test("создаёт новые credentials если их нет", async () => {
      mockPrisma.instagramCredentials.findFirst.mockResolvedValue(null);
      mockPrisma.instagramCredentials.create.mockResolvedValue(mockCredentials);

      const result = await saveState(mockState);

      expect(mockPrisma.instagramCredentials.create).toHaveBeenCalled();
      expect(result.id).toBe(mockCredentials.id);
    });

    test("обновляет state в существующих credentials", async () => {
      mockPrisma.instagramCredentials.findFirst.mockResolvedValue(
        mockCredentials
      );
      mockPrisma.instagramCredentials.update.mockResolvedValue(mockCredentials);

      const result = await saveState(mockState);

      expect(mockPrisma.instagramCredentials.update).toHaveBeenCalled();
      expect(result.id).toBe(mockCredentials.id);
    });
  });
});
