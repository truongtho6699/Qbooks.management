-- Protect D1 against the same invoice with different comma/space formatting.
-- This is a supplementary check. It does not rewrite or delete existing orders.
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_invoice_canonical
ON orders(REPLACE(REPLACE(UPPER(TRIM(invoice_codes)),' ',''),CHAR(9),''));
