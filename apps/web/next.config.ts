import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

function parseImageBaseUrl(): { hostname: string; port: string; protocol: 'http' | 'https' } {
  const raw = process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL ?? 'http://localhost:4443';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    url = new URL('http://localhost:4443');
  }
  const protocol = url.protocol === 'https:' ? 'https' : 'http';
  return { hostname: url.hostname, port: url.port, protocol };
}

const imageUrl = parseImageBaseUrl();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: imageUrl.protocol,
        hostname: imageUrl.hostname,
        port: imageUrl.port,
      },
    ],
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== 'production',
  },
};

export default withNextIntl(nextConfig);
