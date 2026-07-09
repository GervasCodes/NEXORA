-- Chat Tables (buyer <-> seller messaging)
-- Run this in phpMyAdmin (SQL tab) on your NEXORA database.
-- Run after orders.sql / products already existing (depends on `users`, `products`).

CREATE TABLE IF NOT EXISTS conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    buyer_id INT NOT NULL,
    seller_id INT NOT NULL,
    product_id INT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_conversations_buyer
        FOREIGN KEY (buyer_id) REFERENCES users(id),

    CONSTRAINT fk_conversations_seller
        FOREIGN KEY (seller_id) REFERENCES users(id),

    CONSTRAINT fk_conversations_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_id INT NOT NULL,

    message VARCHAR(2000) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_messages_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_messages_sender
        FOREIGN KEY (sender_id) REFERENCES users(id)
);
