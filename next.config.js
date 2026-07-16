/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['firebase-admin', 'osodreamer-sri-xml-signer', 'node-forge'],
  allowedDevOrigins: ['192.168.0.117', '26.73.204.56', 'localhost', '127.0.0.1'],
}

module.exports = nextConfig
