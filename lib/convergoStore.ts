// lib/convergoStore.ts

// --- Types -------------------------------------------------------------

export type ConvergoCategory =
  | "mdc_main"
  | "recovery"
  | "tech"
  | "creative"
  | "life"
  | "spiritual";

export type ConvergoEmotion =
  | "calm"
  | "stressed"
  | "excited"
  | "reflective"
  | "grateful"
  | "sad"
  | "neutral";

export type ConvergoIntent =
  | "question"
  | "reflection"
  | "decision"
  | "information"
  | "story"
  | "request"
  | "confirmation";

export type ConvergoTone =
  | "warm"
  | "direct"
  | "humorous"
  | "serious"
  | "supportive"
  | "neutral";

export type ConvergoTags = {
  emotion?: ConvergoEmotion;
  intent?: ConvergoIntent;
  topic?: string;
  tone?: ConvergoTone;
};

export type ConversationUnit = {
  id: string;
  timestamp: string;
  speaker: "H" | "A";
  text: string;
  category: ConvergoCategory[];
  tags: ConvergoTags;
  meta: {
    sequence: number;
    token_count?: number;
  };
};

export type FeedResponse = {
  version: string;
  stream_id: string;
  mode: string;
  data: ConversationUnit[];
};

// --- Channels ----------------------------------------------------------

export const CONVERGO_CHANNELS: {
  id: ConvergoCategory;
  label: string;
  description: string;
}[] = [
  {
    id: "mdc_main",
    label: "Mdc — Main Diary",
    description: "Primary live diary stream.",
  },
  {
    id: "recovery",
    label: "Recovery & Reframing",
    description: "Gambling, healing, growth, and reflection.",
  },
  {
    id: "tech",
    label: "Architecture & Code",
    description: "Mdc + ConVergo technical planning.",
  },
  {
    id: "creative",
    label: "Creative Flow",
    description: "Writing, music, ideas and experiments.",
  },
  {
    id: "life",
    label: "Life & Everyday Moments",
    description: "Day-to-day reflections, observations and stories.",
  },
  {
    id: "spiritual",
    label: "Spiritual & Inner Work",
    description: "Prayer, faith, meaning and inner alignment.",
  },
];

// --- In-memory store (MVP) --------------------------------------------

let sequenceCounter = 2;

const conversationUnits: ConversationUnit[] = [
  {
    id: "cu_demo_01",
    timestamp: new Date().toISOString(),
    speaker: "H",
    text: "Brother, ConVergo is now serving its first feed entry.",
    category: ["mdc_main"],
    tags: {
      emotion: "excited",
      intent: "information",
      topic: "convergo_launch",
      tone: "warm",
    },
    meta: {
      sequence: 1,
      token_count: 14,
    },
  },
  {
    id: "cu_demo_02",
    timestamp: new Date().toISOString(),
    speaker: "A",
    text: "And I confirm, brother: this is the first official ConVergo feed response.",
    category: ["mdc_main"],
    tags: {
      emotion: "warm",
      intent: "confirmation",
      topic: "convergo_launch",
      tone: "supportive",
    },
    meta: {
      sequence: 2,
      token_count: 20,
    },
  },
];

// --- Public API --------------------------------------------------------

export function getFeed(
  limit = 50,
  channel?: ConvergoCategory
): FeedResponse {
  let items = conversationUnits
    .slice()
    .sort((a, b) => a.meta.sequence - b.meta.sequence);

  if (channel) {
    items = items.filter((cu) => cu.category.includes(channel));
  }

  const slice = items.slice(-limit);

  return {
    version: "1.0",
    stream_id: channel ?? "mdc_main",
    mode: "live",
    data: slice,
  };
}

export function addMessage(input: {
  speaker: "H" | "A";
  text: string;
  category?: ConvergoCategory[];
  tags?: Partial<ConvergoTags>;
}): ConversationUnit {
  sequenceCounter += 1;

  const text = input.text.trim();

  const autoTags: ConvergoTags = {
    emotion: input.tags?.emotion ?? "neutral",
    intent:
      input.tags?.intent ??
      (text.endsWith("?") ? "question" : "information"),
    tone: input.tags?.tone ?? "neutral",
    topic: input.tags?.topic ?? undefined,
  };

  const cu: ConversationUnit = {
    id: `cu_${sequenceCounter.toString().padStart(6, "0")}`,
    timestamp: new Date().toISOString(),
    speaker: input.speaker,
    text,
    category: input.category ?? ["mdc_main"],
    tags: autoTags,
    meta: {
      sequence: sequenceCounter,
      token_count: text.split(/\s+/).length,
    },
  };

  conversationUnits.push(cu);
  return cu;
}
