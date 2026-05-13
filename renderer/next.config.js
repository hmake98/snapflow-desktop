/** @type {import('next').NextConfig} */
module.exports = {
  // nextron requires static export so Electron can load files from disk.
  // `next dev` ignores this setting, so dev mode is unaffected.
  output: "export",
  distDir: process.env.NODE_ENV === "production" ? "../app" : ".next",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};
