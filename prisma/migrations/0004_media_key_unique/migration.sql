-- Media objects are referenced by a unique storage key; a unique constraint
-- guarantees a storage object can be represented by at most one media record
-- (and a document record), so records cannot shadow each other for public
-- delivery.
CREATE UNIQUE INDEX IF NOT EXISTS "Media_key_key" ON "Media"("key");
