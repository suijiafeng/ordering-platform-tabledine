import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

const stripOrigin: ProxyOptions['configure'] = (proxy) => {
  proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'))
}

export default defineConfig({
  plugins: [react()],
  server: {
    // 允许用 PORT 环境变量换端口（同一台机器开多个预览时不冲突），默认仍为 5173
    port: Number(process.env.PORT) || 5173,
    // 开发时代理到本地后端，和生产环境 Nginx 同域部署保持一致。
    // 对浏览器而言是同源请求，不需要 CORS；去掉代理转发的 Origin 头，换端口预览时后端也不会按 CORS 白名单拒绝
    proxy: {
      '/api': { target: 'http://localhost:8080', configure: stripOrigin },
      '/uploads': { target: 'http://localhost:8080', configure: stripOrigin },
    },
  },
})
