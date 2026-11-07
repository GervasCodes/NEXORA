-- Migration 145: Delivery business-management foundation.
-- Run after 144_pos_stock_ledger.sql.
--
-- A "delivery business" is owned by an existing delivery_agent account (no
-- new users.role value - every role check, verification flow, chat and
-- socket path keeps working unchanged). The owner keeps their own agent
-- approval; the business is an extra profile row hanging off that account.
--
-- delivery_business_agents is the owner's roster. agent_id is UNIQUE so an
-- agent belongs to at most one business at a time (otherwise two owners
-- would both see, and both assign work to, the same rider).
--
-- delivery_business_jobs are INDEPENDENT delivery jobs - ones that did not
-- originate from a Nexora order. They never touch orders, deliveries,
-- dispatch, wallets or agent_earnings. The fee is record-only: the owner
-- logs the amount and whether it was collected off-platform; no money
-- moves through Nexora.
--
-- Cascades: deleting the owner's user removes the business, roster and
-- jobs; deleting a rider just clears assigned_agent_id on their jobs
-- (history stays). This keeps account deletion working without changes to
-- the admin deletion code.
CREATE TABLE IF NOT EXISTS delivery_businesses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_user_id INT NOT NULL,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_delivery_businesses_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_delivery_businesses_owner (owner_user_id)
);

CREATE TABLE IF NOT EXISTS delivery_business_agents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    business_id INT NOT NULL,
    agent_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_dba_business FOREIGN KEY (business_id) REFERENCES delivery_businesses(id) ON DELETE CASCADE,
    CONSTRAINT fk_dba_agent FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_dba_agent (agent_id),
    INDEX idx_dba_business (business_id)
);

CREATE TABLE IF NOT EXISTS delivery_business_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    business_id INT NOT NULL,
    assigned_agent_id INT NULL,

    reference VARCHAR(40) NULL,
    pickup_address VARCHAR(255) NOT NULL,
    dropoff_address VARCHAR(255) NOT NULL,
    customer_name VARCHAR(120) NOT NULL,
    customer_phone VARCHAR(30) NULL,
    description VARCHAR(255) NULL,

    status ENUM('created', 'assigned', 'picked_up', 'delivered', 'cancelled') NOT NULL DEFAULT 'created',

    fee_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    fee_collected BOOLEAN NOT NULL DEFAULT FALSE,
    fee_collected_at DATETIME NULL,

    assigned_at DATETIME NULL,
    picked_up_at DATETIME NULL,
    delivered_at DATETIME NULL,
    cancelled_at DATETIME NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_dbj_business FOREIGN KEY (business_id) REFERENCES delivery_businesses(id) ON DELETE CASCADE,
    CONSTRAINT fk_dbj_agent FOREIGN KEY (assigned_agent_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_dbj_fee CHECK (fee_amount >= 0),
    INDEX idx_dbj_business_status (business_id, status, created_at),
    INDEX idx_dbj_agent (assigned_agent_id, status)
);
