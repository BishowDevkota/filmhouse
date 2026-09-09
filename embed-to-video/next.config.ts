import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Playwright is an optional peer dependency: the browser resolver loads it at
   * runtime only when `ENABLE_BROWSER_RESOLVER` is set. Marking it external
   * keeps it out of the server bundle.
   */
  serverExternalPackages: ["playwright"],

  turbopack: {
    /**
     * `browser.ts` deliberately requires Playwright without depending on it, so
     * the app builds and runs whether or not it is installed. Suppress the
     * expected "module not found" notice for that one file.
     */
    ignoreIssue: [
      {
        path: "**/src/lib/extraction/browser.ts",
        title: /Module not found/,
      },
    ],
  },
};

export default nextConfig;
