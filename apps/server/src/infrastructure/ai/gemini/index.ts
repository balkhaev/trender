import { ai } from "../../../config";
import { GeminiService } from "./gemini.client";

// Re-export class
export { GeminiService } from "./gemini.client";
// Re-export parsers for external use if needed
export {
  extractTextFromResponse,
  JSON_REGEX,
  parseRawAnalysis,
  parseRawAnalysisWithoutOptions,
} from "./gemini.parsers";
// Re-export types
export type {
  CameraMovement,
  DetectableElement,
  ElementAppearance,
  ElementWithAppearances,
  ElementWithoutOptions,
  GeminiProgressCallback,
  RemixOption,
  SceneBoundary,
  TextOverlay,
  UnifiedVideoAnalysis,
  VideoAnalysis,
  VideoAnalysisWithoutOptions,
  VideoAudio,
  VideoCharacter,
  VideoObject,
  VideoScene,
  VideoTransition,
} from "./gemini.types";

// Singleton instance
let geminiServiceInstance: GeminiService | null = null;

const geminiConfig = ai.gemini;

export function getGeminiService(): GeminiService {
  if (!geminiServiceInstance) {
    if (!geminiConfig.isConfigured()) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    geminiServiceInstance = new GeminiService(geminiConfig.apiKey);
  }
  return geminiServiceInstance;
}

export const isGeminiConfigured = geminiConfig.isConfigured;
