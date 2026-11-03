-- 0010_auth
-- Login, sessions, invitations. The organisation of every request now comes from the user's row here, never from the client.
--
--   user_account    one login per person. Links to the employee row, which still holds the role and department.
--                   email is unique across ALL organisations because the email is how a person logs in.
--   refresh_token   one row per refresh token ever issued. Only a SHA-256 of the token is stored, so a database leak cannot be
--                   replayed. family_id ties together the tokens of one login: using a token that was already used revokes the
--                   whole family (token reuse = theft).
--   user_token      one-time links for email verification and password reset (hashed, expiring, single use).
--   invitation      an Org Admin invites an email address with a role and department; accepting creates the employee + user.

CREATE TABLE user_account (
  user_id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organisation_id   INT UNSIGNED NOT NULL,
  employee_id       INT UNSIGNED NOT NULL,
  email             VARCHAR(120) NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  email_verified_at DATETIME     NULL,
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

CREATE TABLE user_token (
  token_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  organisation_id INT UNSIGNED NOT NULL,
  purpose         VARCHAR(10)  NOT NULL,
  token_hash      CHAR(64)     NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME     NOT NULL,
  used_at         DATETIME     NULL,
  PRIMARY KEY (token_id),
  UNIQUE KEY uq_user_token_hash (token_hash),
  KEY ix_user_token_user (user_id, purpose),
  CONSTRAINT fk_user_token_user FOREIGN KEY (user_id, organisation_id)
    REFERENCES user_account (user_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_user_token_purpose CHECK (purpose IN ('verify', 'reset'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE invitation (
  invitation_id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organisation_id INT UNSIGNED NOT NULL,
  email           VARCHAR(120) NOT NULL,
  role            VARCHAR(20)  NOT NULL,
  department_id   INT UNSIGNED NOT NULL,
  invited_by      INT UNSIGNED NOT NULL,                          -- the employee who sent it
  token_hash      CHAR(64)     NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME     NOT NULL,
  accepted_at     DATETIME     NULL,
  revoked_at      DATETIME     NULL,
  PRIMARY KEY (invitation_id),
  UNIQUE KEY uq_invitation_hash (token_hash),
  KEY ix_invitation_org_email (organisation_id, email),
  CONSTRAINT fk_invitation_department FOREIGN KEY (department_id, organisation_id)
    REFERENCES department (department_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_invitation_inviter FOREIGN KEY (invited_by, organisation_id)
    REFERENCES employee (employee_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_invitation_role CHECK (role IN ('Org Admin', 'Risk Officer', 'Department Head', 'Auditor', 'Employee'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
