import type { NextConfig } from 'next'

// 生产与开发都部署在 /h5 下：商家端占用根路径，桌码链接 /q/<token> 由 Nginx 跳转到 /h5/?token=<token>
const basePath = '/h5'
const isStaticExport = process.env.STATIC_EXPORT === 'true'
const apiTarget = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8080'

const nextConfig: NextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  turbopack: { root: process.cwd() },
  allowedDevOrigins: ['127.0.0.1'],
  output: isStaticExport ? 'export' : undefined,
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  images: { unoptimized: true },
  ...(isStaticExport ? {} : {
    // 仅开发服务器：API 与图片在根路径（生产由 Nginx 同域转发），不加 basePath
    async rewrites() {
      return [
        { source: '/api/:path*', destination: `${apiTarget}/api/:path*`, basePath: false },
        { source: '/uploads/:path*', destination: `${apiTarget}/uploads/:path*`, basePath: false },
      ]
    },
  }),
}

export default nextConfig
