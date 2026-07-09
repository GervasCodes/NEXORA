-- Extend conversations to also support buyer <-> delivery_agent chat
-- (previously only buyer <-> seller was possible).
-- Run this in phpMyAdmin (SQL tab), after 011_create_chat.sql.

ALTER TABLE conversations
    MODIFY COLUMN seller_id INT NULL;

ALTER TABLE conversations
    ADD COLUMN delivery_agent_id INT NULL AFTER seller_id,
    ADD COLUMN order_id INT NULL AFTER product_id;

ALTER TABLE conversations
    ADD CONSTRAINT fk_conversations_delivery_agent
        FOREIGN KEY (delivery_agent_id) REFERENCES users(id),
    ADD CONSTRAINT fk_conversations_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE SET NULL;

-- Exactly one of seller_id / delivery_agent_id should be set per conversation
-- (enforced in application code, not a DB constraint, since MySQL CHECK
-- constraints involving multiple nullable columns are awkward to maintain).
