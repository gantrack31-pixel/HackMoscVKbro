CREATE SCHEMA IF NOT EXISTS deckly_private;
CREATE TABLE IF NOT EXISTS deckly_private.templates (
  owner_id text NOT NULL,
  fingerprint text NOT NULL,
  original_id text NOT NULL,
  name text NOT NULL,
  metadata jsonb NOT NULL,
  pptx bytea,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, fingerprint)
);
CREATE TABLE IF NOT EXISTS deckly_private.presentations (
  owner_id text NOT NULL,
  project_id text NOT NULL,
  title text NOT NULL,
  payload jsonb NOT NULL,
  template_fingerprint text NOT NULL,
  fingerprint text NOT NULL,
  source_updated_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, project_id),
  FOREIGN KEY (owner_id, template_fingerprint)
    REFERENCES deckly_private.templates(owner_id, fingerprint)
);
REVOKE ALL ON SCHEMA deckly_private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA deckly_private FROM PUBLIC;
