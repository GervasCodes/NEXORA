-- Loans feature removed. The seller_loans table is no longer used by any code.
-- Existing wallet ledger rows with reference_type 'loan_disbursement' or
-- 'loan_repayment' are kept as history; the enum values stay so those rows stay valid.
DROP TABLE IF EXISTS seller_loans;
