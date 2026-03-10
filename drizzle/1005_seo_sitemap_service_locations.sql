-- Add service-locations to seo_sitemap_type enum for service+location SEO pages.
ALTER TYPE public.seo_sitemap_type ADD VALUE IF NOT EXISTS 'service-locations';
