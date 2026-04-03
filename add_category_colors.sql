-- Add color column to categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS color text DEFAULT '#64748b';

-- Update existing categories with nice colors
UPDATE public.categories SET color = '#3b82f6' WHERE name = 'Operations' AND color = '#64748b';
UPDATE public.categories SET color = '#f59e0b' WHERE name = 'Logistics' AND color = '#64748b';
UPDATE public.categories SET color = '#10b981' WHERE name = 'Warehouse' AND color = '#64748b';
UPDATE public.categories SET color = '#8b5cf6' WHERE name = 'Finance' AND color = '#64748b';
