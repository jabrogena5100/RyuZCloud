-- +goose Up
-- The demo library's collections (content/collections.json; keep the two in sync). Data, not
-- schema: it lives in a migration so a fresh AWS database gets the same collections through the
-- existing migration task, with no admin endpoint. Re-running is harmless.
INSERT INTO collections (slug, title, description, position) VALUES
    ('coastlines',  'Coastlines',  'Shorelines, tides and harbours, mostly at the edges of the day.', 10),
    ('after-dark',  'After dark',  'Cities, roads and rail after sunset, mostly timelapse.', 20),
    ('high-ground', 'High ground', 'Ridges, snow, cloud and wind.', 30),
    ('in-bloom',    'In bloom',    'Flowers opening and seeds letting go, in time-lapse.', 35),
    ('slow-water',  'Slow water',  'Moss, streams, lakes and still pools.', 40),
    ('weather',     'Weather',     'Rain, fog, storms and the sky changing its mind.', 50),
    ('from-orbit',  'From orbit',  'The Earth from orbit. Public-domain footage (mostly NASA) via Wikimedia Commons.', 60)
ON CONFLICT (slug) DO NOTHING;

-- +goose Down
-- Videos keep their rows; their collection_id becomes NULL (ON DELETE SET NULL).
DELETE FROM collections WHERE slug IN ('coastlines', 'after-dark', 'high-ground', 'in-bloom', 'slow-water', 'weather', 'from-orbit');
