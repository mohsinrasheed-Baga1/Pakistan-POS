-- =====================================================
-- Fix duplicate sales in Supabase
-- Run this ONCE in Supabase SQL Editor
-- =====================================================

-- 1. Delete duplicate sales (keep only one per invoice_no)
DELETE FROM public.sales_history
WHERE id NOT IN (
  SELECT MIN(id) FROM public.sales_history
  GROUP BY invoice_no
);

-- 2. Add unique constraint on invoice_no (prevents future duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoice_unique 
ON public.sales_history(invoice_no);

-- 3. Delete duplicate card_transactions (keep one per sale_invoice_no)
DELETE FROM public.card_transactions
WHERE id NOT IN (
  SELECT MIN(id) FROM public.card_transactions
  WHERE sale_invoice_no IS NOT NULL
  GROUP BY sale_invoice_no
);

-- 4. Add unique constraint on sale_invoice_no
CREATE UNIQUE INDEX IF NOT EXISTS idx_txns_sale_invoice_unique 
ON public.card_transactions(sale_invoice_no)
WHERE sale_invoice_no IS NOT NULL;

-- 5. Verify
SELECT 'sales_history' as table_name, count(*) as total FROM public.sales_history
UNION ALL
SELECT 'card_transactions', count(*) FROM public.card_transactions;
