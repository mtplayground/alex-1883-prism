CREATE TABLE user_settings (
    user_sub TEXT PRIMARY KEY REFERENCES users(sub) ON DELETE CASCADE,
    personal_color TEXT NOT NULL DEFAULT '#64748B',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_settings_personal_color_hex CHECK (personal_color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_sub TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
    name TEXT NOT NULL,
    initials TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT clients_name_not_blank CHECK (length(trim(name)) > 0),
    CONSTRAINT clients_initials_not_blank CHECK (length(trim(initials)) > 0),
    CONSTRAINT clients_initials_short CHECK (char_length(trim(initials)) <= 4),
    CONSTRAINT clients_color_hex CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE UNIQUE INDEX clients_user_name_unique_idx ON clients (user_sub, LOWER(name));
CREATE UNIQUE INDEX clients_user_color_unique_idx ON clients (user_sub, LOWER(color));

CREATE OR REPLACE FUNCTION ensure_client_color_is_not_personal()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM user_settings
        WHERE user_sub = NEW.user_sub
          AND LOWER(personal_color) = LOWER(NEW.color)
    ) THEN
        RAISE EXCEPTION 'client color must be distinct from the personal color';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ensure_personal_color_is_not_client()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM clients
        WHERE user_sub = NEW.user_sub
          AND LOWER(color) = LOWER(NEW.personal_color)
    ) THEN
        RAISE EXCEPTION 'personal color must be distinct from client colors';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_default_user_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_settings (user_sub)
    VALUES (NEW.sub)
    ON CONFLICT (user_sub) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_settings_set_updated_at
BEFORE UPDATE ON user_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER clients_set_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER clients_color_not_personal
BEFORE INSERT OR UPDATE OF user_sub, color ON clients
FOR EACH ROW
EXECUTE FUNCTION ensure_client_color_is_not_personal();

CREATE TRIGGER personal_color_not_client
BEFORE INSERT OR UPDATE OF user_sub, personal_color ON user_settings
FOR EACH ROW
EXECUTE FUNCTION ensure_personal_color_is_not_client();

CREATE TRIGGER users_create_default_settings
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION create_default_user_settings();

INSERT INTO user_settings (user_sub)
SELECT sub
FROM users
ON CONFLICT (user_sub) DO NOTHING;
