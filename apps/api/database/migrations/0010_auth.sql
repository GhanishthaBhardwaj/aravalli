-- 0010_auth
-- Login and sessions. The organisation of every request now comes from the user's row here, never from the client.
--
--   user_account    one login per person. Links to the employee row, which still holds the role and department.
--                   email is unique across ALL organisations because the email is how a person logs in.
--                   An Org Admin creates the people in their organisation, with a first password, and can set a new one.
--                   Nothing in the product sends email, so there are no verification, reset or invitation tables.
--   refresh_token   one row per refresh token ever issued. Only a SHA-256 of the token is stored, so a database leak cannot be
--                   replayed. family_id ties together the tokens of one login: using a token that was already used revokes the
--                   whole family (token reuse = theft).

CREATE TABLE user_account (
  user_id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organisation_id   INT UNSIGNED NOT NULL,
  employee_id       INT UNSIGNED NOT NULL,
  email             VARCHAR(120) NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  is_demo           BOOLEAN      NOT NULL DEFAULT FALSE,         -- demo accounts can only be entered through the demo login
  last_login_at     DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_user_id_org (user_id, organisation_id),
  UNIQUE KEY uq_user_email (email),
  UNIQUE KEY uq_user_employee (employee_id),
  KEY ix_user_org (organisation_id),
  CONSTRAINT fk_user_employee FOREIGN KEY (employee_id, organisation_id)
    REFERENCES employee (employee_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE refresh_token (
  token_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  organisation_id INT UNSIGNED NOT NULL,
  family_id       CHAR(36)     NOT NULL,
  token_hash      CHAR(64)     NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME     NOT NULL,
  used_at         DATETIME     NULL,                              -- set when it was exchanged for the next token
  revoked_at      DATETIME     NULL,                              -- set on logout, reuse detection or password reset
  user_agent      VARCHAR(200) NULL,
  PRIMARY KEY (token_id),
  UNIQUE KEY uq_refresh_hash (token_hash),
  KEY ix_refresh_family (family_id),
  KEY ix_refresh_user (user_id),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id, organisation_id)
    REFERENCES user_account (user_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
