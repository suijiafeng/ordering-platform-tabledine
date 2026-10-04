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
        '/api': {
          target: process.env.TARO_APP_API_BASE || 'http://127.0.0.1:8080',
          changeOrigin: true,
        },
        '/uploads': {
          target: process.env.TARO_APP_API_BASE || 'http://127.0.0.1:8080',
          changeOrigin: true,
        },
      },
    },
  },
} satisfies UserConfigExport<'webpack5'>
