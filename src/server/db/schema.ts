import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  real,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** All tables use vc_ prefix to coexist with other apps on shared Supabase. */

export const users = pgTable("vc_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  /** bcrypt hash; required for login when set */
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const integrationCredentials = pgTable(
  "vc_integration_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(), // openai | heygen | elevenlabs
    encryptedKey: text("encrypted_key").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("vc_integration_credentials_provider_idx").on(t.provider)],
);

export const appSettings = pgTable(
  "vc_app_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("vc_app_settings_key_idx").on(t.key)],
);

export const bufferAccounts = pgTable("vc_buffer_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  label: text("label").notNull(),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  organizationId: text("organization_id"),
  organizationName: text("organization_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bufferChannels = pgTable(
  "vc_buffer_channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bufferAccountId: uuid("buffer_account_id")
      .notNull()
      .references(() => bufferAccounts.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    name: text("name"),
    displayName: text("display_name"),
    service: text("service"),
    avatar: text("avatar"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("vc_buffer_channels_account_channel_idx").on(
      t.bufferAccountId,
      t.channelId,
    ),
  ],
);

export const ideas = pgTable("vc_ideas", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title"),
  content: text("content").notNull(),
  brandTone: text("brand_tone").notNull().default(""),
  visualStyle: text("visual_style").notNull().default(""),
  status: text("status").notNull().default("new"), // new | prepared | archived
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reelDrafts = pgTable("vc_reel_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  ideaId: uuid("idea_id").references(() => ideas.id, { onDelete: "set null" }),
  hook: text("hook").notNull().default(""),
  script: text("script").notNull().default(""),
  caption: text("caption").notNull().default(""),
  hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
  cta: text("cta").notNull().default(""),
  visualStyle: text("visual_style").notNull().default(""),
  language: text("language").notNull().default("en"), // en | ua
  suggestedDurationSec: integer("suggested_duration_sec").default(30),
  status: text("status").notNull().default("draft"),
  // draft | approved | generating | ready | scheduled | posted | failed
  voiceId: text("voice_id"),
  avatarId: text("avatar_id"),
  styleId: text("style_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SlideshowJobPayload = {
  elevenLabsVoiceId?: string | null;
  sceneCount?: number;
  consistentCharacter?: boolean;
  subtitles?: boolean;
  step?: string;
  scenePlan?: unknown;
};

export type CarouselSlide = {
  index: number;
  headline: string;
  body?: string;
  imagePrompt: string;
};

export type CarouselJobPayload = {
  step?: string;
};

export const carouselDrafts = pgTable("vc_carousel_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  hook: text("hook").notNull().default(""),
  caption: text("caption").notNull().default(""),
  hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
  language: text("language").notNull().default("en"), // en | ua
  niche: text("niche").notNull().default(""),
  audience: text("audience").notNull().default(""),
  productMention: text("product_mention").notNull().default(""),
  slides: jsonb("slides").$type<CarouselSlide[]>().notNull().default([]),
  status: text("status").notNull().default("draft"),
  // draft | approved | generating | ready | scheduled | posted | failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const carousels = pgTable("vc_carousels", {
  id: uuid("id").defaultRandom().primaryKey(),
  carouselDraftId: uuid("carousel_draft_id")
    .notNull()
    .references(() => carouselDrafts.id, { onDelete: "cascade" }),
  slideUrls: jsonb("slide_urls").$type<string[]>().notNull().default([]),
  storagePaths: jsonb("storage_paths").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("pending"),
  // pending | generating | uploading | ready | failed
  jobPayload: jsonb("job_payload").$type<CarouselJobPayload | null>(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const videos = pgTable("vc_videos", {
  id: uuid("id").defaultRandom().primaryKey(),
  reelDraftId: uuid("reel_draft_id")
    .notNull()
    .references(() => reelDrafts.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("heygen"), // heygen | slideshow
  heygenSessionId: text("heygen_session_id"),
  heygenVideoId: text("heygen_video_id"),
  jobPayload: jsonb("job_payload").$type<SlideshowJobPayload | null>(),
  publicUrl: text("public_url"),
  storagePath: text("storage_path"),
  thumbnailUrl: text("thumbnail_url"),
  duration: real("duration"),
  status: text("status").notNull().default("pending"),
  // pending | generating | uploading | ready | failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const scheduledPosts = pgTable("vc_scheduled_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Exactly one of videoId or carouselId should be set. */
  videoId: uuid("video_id").references(() => videos.id, { onDelete: "cascade" }),
  carouselId: uuid("carousel_id").references(() => carousels.id, {
    onDelete: "cascade",
  }),
  reelDraftId: uuid("reel_draft_id").references(() => reelDrafts.id, {
    onDelete: "set null",
  }),
  carouselDraftId: uuid("carousel_draft_id").references(() => carouselDrafts.id, {
    onDelete: "set null",
  }),
  bufferAccountId: uuid("buffer_account_id")
    .notNull()
    .references(() => bufferAccounts.id, { onDelete: "cascade" }),
  bufferChannelId: uuid("buffer_channel_id")
    .notNull()
    .references(() => bufferChannels.id, { onDelete: "cascade" }),
  bufferPostId: text("buffer_post_id"),
  text: text("text").notNull(),
  mode: text("mode").notNull().default("addToQueue"), // addToQueue | customScheduled
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: text("status").notNull().default("scheduled"),
  // scheduled | sent | failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const postMetrics = pgTable("vc_post_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  scheduledPostId: uuid("scheduled_post_id")
    .notNull()
    .references(() => scheduledPosts.id, { onDelete: "cascade" }),
  metrics: jsonb("metrics")
    .$type<Array<{ type: string; name: string; value: number; unit: string }>>()
    .notNull()
    .default([]),
  metricsUpdatedAt: timestamp("metrics_updated_at", { withTimezone: true }),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
});
