import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `ws` is a server-only dependency (keyless Edge neural TTS socket in
  // /api/voice). Keep it external so it never enters the client bundle.
  serverExternalPackages: ["ws"],
};

export default nextConfig;
