/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['firebase-admin', 'osodreamer-sri-xml-signer', 'node-forge'],
}

module.exports = nextConfig
