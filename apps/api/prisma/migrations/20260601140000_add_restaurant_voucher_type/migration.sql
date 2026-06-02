-- Restaurant/dining vouchers — DINING operations previously fell back to a
-- generic SERVICE voucher. Add a dedicated RESTAURANT voucher type so dining
-- rows generate a proper voucher with a restaurant/meal snapshot block.

ALTER TYPE "VoucherType" ADD VALUE IF NOT EXISTS 'RESTAURANT';
