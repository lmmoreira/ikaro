const imageBaseUrl = process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL ?? 'http://localhost:4443';
const parsedImageUrl = new URL(imageBaseUrl);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: parsedImageUrl.protocol.replace(':', ''),
        hostname: parsedImageUrl.hostname,
        port: parsedImageUrl.port,
      },
    ],
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== 'production',
  },
};

export default nextConfig;
