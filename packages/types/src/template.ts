/**
 * Типы для шаблонов и их элементов
 */

export type TemplateReel = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  likeCount: number | null;
  author: string | null;
  source: string;
};

export type RemixOption = {
  id: string;
  label: string;
  icon: string;
  prompt: string;
};

export type ElementAppearance = {
  sceneIndex: number;
  startTime: number;
  endTime: number;
};

export type VideoElementType = "character" | "object" | "background";

export type VideoElement = {
  id: string;
  type: VideoElementType;
  label: string;
  description: string;
  remixOptions: RemixOption[];
  appearances: ElementAppearance[];
  thumbnailUrl?: string | null;
};

export type LegacyElement = {
  id: string;
  type: VideoElementType;
  label: string;
  description: string;
  remixOptions: RemixOption[];
};

export type VideoScene = {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  thumbnailUrl: string | null;
  thumbnailS3Key: string | null;
  elementIds: string[];
  generationStatus:
    | "none"
    | "pending"
    | "processing"
    | "completed"
    | "original";
};

export type AnalysisType = "standard" | "frames" | "scenes";

export type TemplateAnalysis = {
  id: string;
  analysisType: AnalysisType;
  createdAt?: string;
  duration: number | null;
  aspectRatio: string;
  style?: string;
  klingPrompt?: string;
  tags?: string[];
  elements?: LegacyElement[];
  videoElements?: VideoElement[];
  scenesCount?: number;
  videoScenes?: VideoScene[];
};

export type Template = {
  id: string;
  title: string | null;
  tags: string[];
  category: string | null;
  generationCount: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  reel: TemplateReel;
  analysis: TemplateAnalysis;
};

export type TemplateWithGenerations = Template & {
  analysis: TemplateAnalysis & {
    generations: {
      id: string;
      provider: string;
      status: string;
      videoUrl: string | null;
      createdAt: string;
    }[];
  };
};

export type TemplatesListResponse = {
  templates: Template[];
  total: number;
  limit: number;
  offset: number;
};

export type TemplateParams = {
  limit?: number;
  offset?: number;
  category?: string;
  tag?: string;
  published?: boolean;
};

export type CategoryMeta = {
  name: string | null;
  count: number;
};
