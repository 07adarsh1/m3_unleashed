/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
