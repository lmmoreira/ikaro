import { describe, expect, it } from 'vitest';
import { SITE_URL } from '@/features/platform/hotsite/seo';
import robots from './robots';

describe('robots', () => {
  it('allows / and disallows /dashboard and /auth, referencing the sitemap', () => {
    const result = robots();

    expect(result).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/dashboard', '/auth'] },
      sitemap: `${SITE_URL}/sitemap.xml`,
    });
  });
});
