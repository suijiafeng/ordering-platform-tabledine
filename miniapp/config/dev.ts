import type { UserConfigExport } from '@tarojs/cli'

export default {
  logger: {
    quiet: false,
    stats: true,
  },
  mini: {},
  h5: {
    devServer: {
      host: '127.0.0.1',
      port: 10086,
      open: false,
      proxy: {
        // 浏览器使用同源 /api 和 /uploads，避免直接请求 8080 产生跨域错误。
        // 同源请求浏览器仍会在 POST 上带 Origin 头，代理去掉它，后端不会按 CORS 白名单拒绝（与商家端 Vite 代理一致）
        '/api': {
          target: process.env.TARO_APP_API_BASE || 'http://127.0.0.1:8080',
          changeOrigin: true,
          onProxyReq: (proxyReq: { removeHeader: (name: string) => void }) => proxyReq.removeHeader('origin'),
        },
        '/uploads': {
          target: process.env.TARO_APP_API_BASE || 'http://127.0.0.1:8080',
          changeOrigin: true,
          onProxyReq: (proxyReq: { removeHeader: (name: string) => void }) => proxyReq.removeHeader('origin'),
        },
      },
    },
  },
} satisfies UserConfigExport<'webpack5'>
