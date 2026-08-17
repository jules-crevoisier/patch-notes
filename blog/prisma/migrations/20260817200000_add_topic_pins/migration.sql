-- CreateTable
CREATE TABLE "topic_pins" (
    "id" BIGSERIAL NOT NULL,
    "topic_slug" TEXT NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_pins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "topic_pins_topic_ip_key" ON "topic_pins"("topic_slug", "ip_hash");

-- AddForeignKey
ALTER TABLE "topic_pins" ADD CONSTRAINT "topic_pins_topic_slug_fkey" FOREIGN KEY ("topic_slug") REFERENCES "topics"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
