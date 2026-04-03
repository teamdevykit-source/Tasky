-- ==========================================
-- DYNAMIC CATEGORIES & STATUSES TABLES
-- ==========================================

-- 1. Categories table
CREATE TABLE IF NOT EXISTS public.categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Everyone can read categories
CREATE POLICY "Everyone can view categories" ON public.categories
    FOR SELECT USING (auth.role() = 'authenticated');

-- Only Admins can insert/update/delete categories
CREATE POLICY "Admins can manage categories" ON public.categories
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin')
    );


-- 2. Statuses table
CREATE TABLE IF NOT EXISTS public.statuses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    color text DEFAULT '#94a3b8',
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;

-- Everyone can read statuses
CREATE POLICY "Everyone can view statuses" ON public.statuses
    FOR SELECT USING (auth.role() = 'authenticated');

-- Only Admins can insert/update/delete statuses
CREATE POLICY "Admins can manage statuses" ON public.statuses
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin')
    );


-- 3. Seed default categories
INSERT INTO public.categories (name, sort_order) VALUES
    ('Operations', 0),
    ('Logistics', 1),
    ('Warehouse', 2),
    ('Finance', 3)
ON CONFLICT (name) DO NOTHING;

-- 4. Seed default statuses
INSERT INTO public.statuses (name, color, sort_order) VALUES
    ('To Do', '#94a3b8', 0),
    ('In Progress', '#3b82f6', 1),
    ('Review', '#f59e0b', 2),
    ('Ready for Publishing', '#6366f1', 3),
    ('Done', '#10b981', 4)
ON CONFLICT (name) DO NOTHING;
