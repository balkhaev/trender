// Re-export everything from the new modular structure
// This file is kept for backward compatibility

export type {
  KlingBalanceResult,
  KlingGenerationOptions,
  KlingGenerationResult,
  KlingImageElement,
  KlingProgressCallback,
  KlingTaskStatus,
} from "../infrastructure/ai/kling";
export {
  formatDuration,
  generateJwtToken,
  getKlingAccountBalance,
  getKlingService,
  isKlingConfigured,
  KlingService,
  normalizeStatus,
  resetKlingService,
} from "../infrastructure/ai/kling";
