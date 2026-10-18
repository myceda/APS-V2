import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["pdfjs-dist", "exceljs"],
  logging: { incomingRequests: { ignore: [/\/api\/auth\//, /\/sign-in\?/] } },
};

export default nextConfig;
