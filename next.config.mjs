/** @type {import('next').NextConfig} */
const nextConfig = {
  // Convex creative assets / arbitrary advertiser images can render via <img>.
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};

export default nextConfig;
