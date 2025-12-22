import prisma from "@trender/db";
import type { InstagramCredentials } from "@trender/db/generated";

// Cookie type compatible with Playwright (without Playwright dependency)
export type Cookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
};

export type StorageState = {
  cookies: Cookie[];
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
};

/**
 * Получить активные credentials для Instagram
 */
export function getActiveCredentials(): Promise<InstagramCredentials | null> {
  return prisma.instagramCredentials.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Получить cookies из базы данных
 */
export async function getCookiesFromDb(): Promise<Cookie[] | null> {
  const credentials = await getActiveCredentials();
  if (!credentials) {
    return null;
  }
  return credentials.cookies as unknown as Cookie[];
}

/**
 * Получить state из базы данных
 */
export async function getStateFromDb(): Promise<StorageState | null> {
  const credentials = await getActiveCredentials();
  if (!credentials?.state) {
    return null;
  }
  return credentials.state as unknown as StorageState;
}

/**
 * Сохранить cookies в базу данных
 */
export async function saveCookies(cookies: Cookie[]) {
  const existing = await getActiveCredentials();

  if (existing) {
    return prisma.instagramCredentials.update({
      where: { id: existing.id },
      data: {
        cookies: JSON.parse(JSON.stringify(cookies)),
        updatedAt: new Date(),
      },
    });
  }

  return prisma.instagramCredentials.create({
    data: {
      cookies: JSON.parse(JSON.stringify(cookies)),
      isActive: true,
    },
  });
}

/**
 * Сохранить Playwright storage state в базу данных
 */
export async function saveState(state: StorageState) {
  const existing = await getActiveCredentials();

  if (existing) {
    return prisma.instagramCredentials.update({
      where: { id: existing.id },
      data: {
        cookies: JSON.parse(JSON.stringify(state.cookies)),
        state: JSON.parse(JSON.stringify(state)),
        updatedAt: new Date(),
      },
    });
  }

  return prisma.instagramCredentials.create({
    data: {
      cookies: JSON.parse(JSON.stringify(state.cookies)),
      state: JSON.parse(JSON.stringify(state)),
      isActive: true,
    },
  });
}

/**
 * Проверить есть ли сохранённые credentials
 */
export async function hasCredentials(): Promise<boolean> {
  const credentials = await getActiveCredentials();
  return credentials !== null;
}
