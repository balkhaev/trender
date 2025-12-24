// Scene in the video with timestamp
export type VideoScene = {
  timestamp: string; // "0:00-0:03"
  description: string;
  action: string;
};

// Character/person in the video
export type VideoCharacter = {
  id: string; // "person1", "person2"
  age: string; // "mid-20s", "elderly"
  gender: string;
  appearance: string; // physical description
  clothing: string;
  actions: string; // what they do in the video
};

// Object in the video
export type VideoObject = {
  name: string;
  role: string; // "main focus", "background prop", "interactive"
  position: string; // "center frame", "left side"
  description: string;
};

// Camera movement segment
export type CameraMovement = {
  type: string; // "static", "pan", "tilt", "dolly", "crane", "handheld", "drone", "zoom"
  direction: string; // "left", "right", "up", "down", "forward", "backward"
  speed: string; // "slow", "medium", "fast"
  startTime: string;
  endTime: string;
};

// Scene transition
export type VideoTransition = {
  type: string; // "cut", "fade", "dissolve", "wipe"
  timestamp: string;
};

// Audio description
export type VideoAudio = {
  music: string; // genre, mood, tempo
  speech: string; // dialogue, voiceover, none
  effects: string; // sound effects present
  mood: string; // audio atmosphere
};

// Text overlay
export type TextOverlay = {
  text: string;
  timestamp: string;
  position: string; // "top", "center", "bottom"
  style: string; // "bold title", "subtitle", "caption"
};

// Creative remix option for a specific element
export type RemixOption = {
  id: string; // "variant-1"
  label: string; // "Cyberpunk Robot"
  icon: string; // emoji
  prompt: string; // "Transform the [subject] into a futuristic cyberpunk robot with neon details"
};

// Detectable element in the video
export type DetectableElement = {
  id: string; // "element-1", "char-1"
  type: "character" | "object" | "background";
  label: string; // "Ginger Cat", "Coffee Cup", "Kitchen"
  description: string; // "A fluffy ginger cat sitting..."
  remixOptions: RemixOption[]; // Specific replacements for THIS element
};

// Video analysis - simplified to focus on elements
export type VideoAnalysis = {
  duration: number | null;
  aspectRatio: string;
  tags: string[];
  elements: DetectableElement[];
};

// Element without options (for enchanting mode)
export type ElementWithoutOptions = Omit<DetectableElement, "remixOptions">;

// Video analysis without options (for enchanting mode)
export type VideoAnalysisWithoutOptions = {
  duration: number | null;
  aspectRatio: string;
  tags: string[];
  elements: ElementWithoutOptions[];
};

// Scene appearance for an element
export type ElementAppearance = {
  sceneIndex: number;
  startTime: number;
  endTime: number;
};

// Element with appearances (for unified analysis)
export type ElementWithAppearances = {
  id: string;
  type: "character" | "object" | "background";
  label: string;
  description: string;
  appearances: ElementAppearance[];
};

// Scene boundary from PySceneDetect
export type SceneBoundary = {
  index: number;
  startTime: number;
  endTime: number;
};

// Unified analysis result (elements with appearances)
export type UnifiedVideoAnalysis = {
  duration: number | null;
  aspectRatio: string;
  tags: string[];
  elements: ElementWithAppearances[];
};

// Callback for tracking Gemini operation progress
export type GeminiProgressCallback = (
  stage: string,
  percent: number,
  message: string
) => void | Promise<void>;

// Raw analysis types for parsing
export type GeminiRawAnalysis = {
  duration?: number | string | null;
  aspectRatio?: string;
  tags?: string[];
  elements?: DetectableElement[];
};

export type RawAnalysisWithoutOptions = {
  duration?: number | string | null;
  aspectRatio?: string;
  tags?: string[];
  elements?: ElementWithoutOptions[];
};

export type RawUnifiedAnalysis = {
  duration?: number | string | null;
  aspectRatio?: string;
  tags?: string[];
  elements?: ElementWithAppearances[];
};
