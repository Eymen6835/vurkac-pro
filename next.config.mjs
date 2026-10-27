const isGithubActions = process.env.GITHUB_ACTIONS === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isGithubActions
    ? {
        output: "export",
        basePath: "/vurkac-pro",
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
