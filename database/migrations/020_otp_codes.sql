-- One-time passcodes sent by email via Brevo, used for:
--   'login'            - verifying identity after email+password, before a
--                         real session token is issued
--   'password_change'  - verifying identity in Settings before the
--                         password-update form is shown
--
-- Codes are stored hashed (never plaintext) with an expiry and an attempt
-- counter so a stolen/guessed code can't be brute-forced.

CREATE TABLE IF NOT EXISTS otp_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    purpose ENUM('login', 'password_change') NOT NULL,

    code_hash VARCHAR(255) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,

    consumed_at TIMESTAMP NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_otp_codes_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_otp_codes_user_purpose ON otp_codes (user_id, purpose, consumed_at);
