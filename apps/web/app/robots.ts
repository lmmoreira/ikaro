import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/features/platform/hotsite/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard', '/auth'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
