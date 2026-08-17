-- AlterTable
-- Note: "posts_search_trgm_idx" (raw-SQL GIN trigram index from the init
-- migration, not modeled in schema.prisma) intentionally stays untouched.
-- `prisma migrate dev` initially proposed dropping it here as schema drift
-- against the unmodeled index; that DROP was removed by hand since dropping
-- it is out of scope for this migration and would regress ILIKE search
-- performance on posts.search_text.
ALTER TABLE "posts" ADD COLUMN     "pin_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "post_pins" (
    "id" BIGSERIAL NOT NULL,
    "post_id" TEXT NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_pins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggestions" (
    "id" BIGSERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "email" TEXT,
    "ip_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_pins_post_ip_key" ON "post_pins"("post_id", "ip_hash");

-- CreateIndex
CREATE INDEX "suggestions_created_idx" ON "suggestions"("created_at" DESC);

-- CreateIndex
CREATE INDEX "suggestions_ip_created_idx" ON "suggestions"("ip_hash", "created_at");

-- AddForeignKey
ALTER TABLE "post_pins" ADD CONSTRAINT "post_pins_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
