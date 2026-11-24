-- +goose Up
-- Attribution for footage the uploader did not create (the demo library comes from Pixabay and
-- Wikimedia Commons). Set by the video's owner; shown on the watch page. NULL means "own footage /
-- no credit given". Shape (validated by the API): {source, source_page_url, author, author_url,
-- license_name, license_url}.
ALTER TABLE videos ADD COLUMN credit jsonb;
ALTER TABLE videos ADD CONSTRAINT ck_videos_credit_is_object CHECK (credit IS NULL OR jsonb_typeof(credit) = 'object');

-- +goose Down
ALTER TABLE videos DROP CONSTRAINT ck_videos_credit_is_object;
ALTER TABLE videos DROP COLUMN credit;
