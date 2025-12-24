import { ai } from "../../../config";
import { KlingService } from "./kling.client";
import { generateJwtToken, TRAILING_SLASH_REGEX } from "./kling.helpers";
import type {
  KlingAccountCostsResponse,
  KlingBalanceResult,
} from "./kling.types";

// Re-export class
export { KlingService } from "./kling.client";
// Re-export helpers for external use if needed
export {
  formatDuration,
  generateJwtToken,
  normalizeStatus,
} from "./kling.helpers";
// Re-export types
export type {
  KlingBalanceResult,
  KlingGenerationOptions,
  KlingGenerationResult,
  KlingImageElement,
  KlingProgressCallback,
  KlingTaskStatus,
} from "./kling.types";

const klingConfig = ai.kling;

// Singleton instance
let klingServiceInstance: KlingService | null = null;

export function getKlingService(): KlingService {
  if (!klingConfig.isConfigured()) {
    throw new Error(
      "KLING_ACCESS_KEY and KLING_SECRET_KEY environment variables are required"
    );
  }

  // Use singleton to reuse JWT token and respect rate limits
  if (!klingServiceInstance) {
    klingServiceInstance = new KlingService(
      klingConfig.accessKey,
      klingConfig.secretKey
    );
  }

  return klingServiceInstance;
}

/**
 * Reset singleton (for tests or when config changes)
 */
export function resetKlingService(): void {
  klingServiceInstance = null;
}

/**
 * Check if Kling API is configured
 */
export const isKlingConfigured = klingConfig.isConfigured;

/**
 * Get account balance (sum of all active resource packs)
 * This is a static method that creates its own auth to call /account/costs
 */
export async function getKlingAccountBalance(): Promise<KlingBalanceResult> {
  if (!klingConfig.isConfigured()) {
    return { remainingTokens: 0, error: "Kling API not configured" };
  }

  try {
    const token = generateJwtToken(
      klingConfig.accessKey,
      klingConfig.secretKey
    );

    // /account/costs is NOT under /v1, use base URL without version
    let baseUrl = klingConfig.apiUrl.replace(TRAILING_SLASH_REGEX, "");
    if (baseUrl.endsWith("/v1")) {
      baseUrl = baseUrl.slice(0, -3);
    }

    // Query params: last year to now
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
    const url = `${baseUrl}/account/costs?start_time=${oneYearAgo}&end_time=${now}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        remainingTokens: 0,
        error: `API error ${response.status}: ${error}`,
      };
    }

    const data = (await response.json()) as KlingAccountCostsResponse;

    if (data.code !== 0 || !data.data?.resource_pack_subscribe_infos) {
      return {
        remainingTokens: 0,
        error: data.message || "Failed to get balance",
      };
    }

    // Sum remaining_quantity of all active ("online") packs
    const activeTokens = data.data.resource_pack_subscribe_infos
      .filter((pack) => pack.status === "online")
      .reduce((sum, pack) => sum + pack.remaining_quantity, 0);

    return { remainingTokens: Math.floor(activeTokens) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { remainingTokens: 0, error: msg };
  }
}
