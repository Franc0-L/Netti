import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.PUBLIC_SITE_URL;

  if (!siteUrl) {
    return {
      rules: { userAgent: '*', disallow: ['/'] },
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: ['/'],
      disallow: ['/admin', '/api/'],
    },
    sitemap: new URL('/sitemap.xml', siteUrl).toString(),
  };
}
