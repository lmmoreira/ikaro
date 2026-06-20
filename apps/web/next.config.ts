import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const imageBaseUrl = process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL ?? 'http://localhost:4443';
const parsedImageUrl = new URL(imageBaseUrl);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: parsedImageUrl.protocol.replace(':', '') as 'http' | 'https',
        hostname: parsedImageUrl.hostname,
        port: parsedImageUrl.port,
      },
    ],
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== 'production',
  },
};

export default withNextIntl(nextConfig);
