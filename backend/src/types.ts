export type NewsSettings = {
  mediaBias: string;
  mediaBiasId?: string;
  mediaBiasPrompt?: string;
  biasIntensity: number;
  criticalIntensity: number;
  excitement: number;
  outputLength: string;
  audience: string;
  platform: string;
};

export type BiasProfile = {
  id: string;
  name: string;
  worldview: string;
  tone: string;
  goals: string;
  redLines: string;
  promptFile: string;
  status: "active" | "archived";
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NewsSource = {
  id: string;
  kind: "url" | "text";
  url?: string;
  title?: string;
  originalText?: string;
  extractedText: string;
  createdAt: string;
};

export type NewsVersion = {
  id: string;
  headline: string;
  lead: string;
  body: string;
  settings: NewsSettings;
  createdAt: string;
};

export type NewsArticle = {
  id: string;
  subject: string;
  headline: string;
  lead: string;
  body: string;
  settings: NewsSettings;
  sources: NewsSource[];
  versions: NewsVersion[];
  threadId?: string;
  status: "draft" | "ready";
  createdAt: string;
  updatedAt: string;
};

export type Database = { articles: NewsArticle[]; biases: BiasProfile[] };
