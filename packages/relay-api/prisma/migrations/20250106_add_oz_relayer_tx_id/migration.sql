-- SPEC-QUEUE-001: Add OZ Relayer transaction ID for idempotency
-- Stores OZ Relayer's internal transaction ID to prevent duplicate submissions
-- If set, consumer should poll for status instead of re-submitting

ALTER TABLE `transactions` ADD COLUMN `oz_relayer_tx_id` VARCHAR(191) NULL;

-- Create unique index for oz_relayer_tx_id
CREATE UNIQUE INDEX `transactions_oz_relayer_tx_id_key` ON `transactions`(`oz_relayer_tx_id`);
