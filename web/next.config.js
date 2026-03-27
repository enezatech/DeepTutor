/** @type {import('next').NextConfig} */

// Backend port for API proxying (used in reverse proxy deployments)
const BACKEND_PORT = process.env.NEXT_PUBLIC_BACKEND_PORT || "8001";

const nextConfig = {
  // Move dev indicator to bottom-right corner
  devIndicators: {
    position: "bottom-right",
  },

  // Proxy /api/v1/* requests to the backend when running behind a reverse proxy (Coolify/Nginx).
  // This allows the browser to make same-origin HTTPS requests to the Next.js server,
  // which then forwards them to the backend via HTTP internally.
  // This prevents Mixed Content errors when the page is served over HTTPS.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `http://localhost:${BACKEND_PORT}/api/v1/:path*`,
      },
    ];
  },

  // Transpile mermaid and related packages for proper ESM handling
  transpilePackages: ["mermaid"],

  // Turbopack configuration (Next.js 16+ uses Turbopack by default for dev)
  turbopack: {
    resolveAlias: {
      // Fix for mermaid's cytoscape dependency - use CJS version
      cytoscape: "cytoscape/dist/cytoscape.cjs.js",
    },
  },

  // Webpack configuration (used for production builds - next build)
  webpack: (config) => {
    const path = require("path");
    config.resolve.alias = {
      ...config.resolve.alias,
      cytoscape: path.resolve(
        __dirname,
        "node_modules/cytoscape/dist/cytoscape.cjs.js",
      ),
    };
    return config;
  },
};

module.exports = nextConfig;
