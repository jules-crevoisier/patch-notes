-- Migration initiale pour patch-notes.fr blog.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "topics" (
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'fr-intl',
    "is_listed" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("slug")
);

CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "topic_slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "slot" TEXT,
    "mode" TEXT,
    "source_groups" JSONB NOT NULL DEFAULT '{}',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "debug" JSONB NOT NULL DEFAULT '{}',
    "search_text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "posts_topic_created_idx" ON "posts" ("topic_slug", "created_at" DESC);
CREATE INDEX "posts_created_idx" ON "posts" ("created_at" DESC);
-- Index GIN trigram pour la recherche ILIKE rapide sur posts.search_text.
CREATE INDEX "posts_search_trgm_idx" ON "posts" USING GIN ("search_text" gin_trgm_ops);

CREATE TABLE "articles" (
    "id" BIGSERIAL NOT NULL,
    "post_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "url_key" TEXT NOT NULL,
    "source" TEXT,
    "region" TEXT,
    "method" TEXT,
    "snippet" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "articles_post_id_idx" ON "articles" ("post_id");
CREATE INDEX "articles_url_key_idx" ON "articles" ("url_key");

CREATE TABLE "gemini_calls" (
    "id" BIGSERIAL NOT NULL,
    "called_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "topic_slug" TEXT,

    CONSTRAINT "gemini_calls_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gemini_calls_called_at_idx" ON "gemini_calls" ("called_at" DESC);

ALTER TABLE "posts"
    ADD CONSTRAINT "posts_topic_slug_fkey"
    FOREIGN KEY ("topic_slug") REFERENCES "topics"("slug")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "articles"
    ADD CONSTRAINT "articles_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "posts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
