import type { NextConfig } from "next";

// Posters, backdrops and the logo load straight from their CDNs via plain
// <img> tags, so the app never touches Vercel's metered /_next/image
// optimizer (it returns 402 once the plan's transformation quota runs out).
const nextConfig: NextConfig = {};

export default nextConfig;
