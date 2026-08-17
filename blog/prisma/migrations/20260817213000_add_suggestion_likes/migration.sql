-- Like count + per-visitor likes on public topic suggestions.

ALTER TABLE "suggestions" ADD COLUMN "like_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "suggestion_likes" (
    "id" BIGSERIAL NOT NULL,
    "suggestion_id" BIGINT NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggestion_likes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suggestion_likes_suggestion_ip_key" ON "suggestion_likes"("suggestion_id", "ip_hash");

ALTER TABLE "suggestion_likes" ADD CONSTRAINT "suggestion_likes_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "suggestions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "suggestions_like_count_created_idx" ON "suggestions"("like_count" DESC, "created_at" DESC);
