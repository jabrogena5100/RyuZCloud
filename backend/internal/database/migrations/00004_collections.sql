-- +goose Up
-- Curated collections (the home page rows and /collections pages) and one featured video
-- for the home hero. Collections are curated by the operator (seed script or SQL), so there
-- is no owner: a video belongs to at most one collection, chosen by the video's owner.
CREATE TABLE collections (
    id          uuid         NOT NULL DEFAULT gen_random_uuid(),
    slug        varchar(60)  NOT NULL,
    title       varchar(100) NOT NULL,
    description varchar(500) NOT NULL DEFAULT '',
    position    integer      NOT NULL DEFAULT 0,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_collections PRIMARY KEY (id),
    CONSTRAINT uq_collections_slug UNIQUE (slug),
    CONSTRAINT ck_collections_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

ALTER TABLE videos ADD COLUMN collection_id uuid;
ALTER TABLE videos ADD CONSTRAINT fk_videos_collection_id_collections
    FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE SET NULL;
CREATE INDEX ix_videos_collection_id ON videos (collection_id);

-- The hero shows the most recently featured public, ready video.
ALTER TABLE videos ADD COLUMN featured_at timestamptz;
CREATE INDEX ix_videos_featured_at ON videos (featured_at DESC) WHERE featured_at IS NOT NULL;

-- +goose Down
DROP INDEX ix_videos_featured_at;
ALTER TABLE videos DROP COLUMN featured_at;
DROP INDEX ix_videos_collection_id;
ALTER TABLE videos DROP CONSTRAINT fk_videos_collection_id_collections;
ALTER TABLE videos DROP COLUMN collection_id;
DROP TABLE collections;
