CREATE UNIQUE INDEX clients_user_id_unique_idx ON clients (user_sub, id);

CREATE TABLE time_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_sub TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
    day DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    title TEXT,
    category TEXT NOT NULL,
    client_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT time_blocks_category_check CHECK (category IN ('client', 'personal')),
    CONSTRAINT time_blocks_assignment_check CHECK (
        (category = 'personal' AND client_id IS NULL)
        OR (category = 'client' AND client_id IS NOT NULL)
    ),
    CONSTRAINT time_blocks_time_order_check CHECK (end_time > start_time),
    CONSTRAINT time_blocks_title_not_blank CHECK (
        title IS NULL
        OR length(trim(title)) > 0
    ),
    CONSTRAINT time_blocks_client_owner_fk
        FOREIGN KEY (user_sub, client_id)
        REFERENCES clients(user_sub, id)
        ON DELETE CASCADE
);

CREATE INDEX time_blocks_user_day_start_idx
ON time_blocks (user_sub, day, start_time);

CREATE INDEX time_blocks_user_client_idx
ON time_blocks (user_sub, client_id)
WHERE client_id IS NOT NULL;

CREATE TRIGGER time_blocks_set_updated_at
BEFORE UPDATE ON time_blocks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
