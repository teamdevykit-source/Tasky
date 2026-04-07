-- ==========================================
-- CONVERT DATE COLUMNS TO TIMESTAMPTZ (WITH TIME)
-- ==========================================

-- 1. Alter the columns to timestamptz (keeping data if possible)
ALTER TABLE public.tasks 
ALTER COLUMN start_date TYPE timestamptz USING start_date::timestamptz,
ALTER COLUMN end_date TYPE timestamptz USING end_date::timestamptz;

-- Note: This ensures we can now store hours, minutes, and timezones.
