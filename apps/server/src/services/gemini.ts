// Re-export everything from the new modular structure
// This file is kept for backward compatibility

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
} from "../infrastructure/ai/gemini";
export {
  extractTextFromResponse,
  GeminiService,
  getGeminiService,
  isGeminiConfigured,
  JSON_REGEX,
  parseRawAnalysis,
  parseRawAnalysisWithoutOptions,
} from "../infrastructure/ai/gemini";
