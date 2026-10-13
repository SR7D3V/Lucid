-- Single-use password reset tokens. As with sessions, only a SHA-256 of each token is stored, so a
-- database leak cannot be turned into working reset links. A token is consumed by deleting its row.

CREATE TABLE password_reset_tokens (
  token_hash  bytea PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX password_reset_tokens_customer_idx ON password_reset_tokens (customer_id);
CREATE INDEX password_reset_tokens_expires_idx ON password_reset_tokens (expires_at);
