/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 登录页演示账号提示，如「admin / admin123」；不配置则只在开发环境显示 */
  readonly VITE_DEMO_ACCOUNT?: string
}
