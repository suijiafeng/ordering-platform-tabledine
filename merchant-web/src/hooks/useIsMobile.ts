import { Grid } from 'antd'

/** 窄屏（< md 768px）：侧栏改抽屉、表格横向滚动、详情抽屉全屏 */
export function useIsMobile(): boolean {
  const screens = Grid.useBreakpoint()
  // 首次渲染 breakpoint 还没算出来时 screens.md 为 undefined，按桌面处理避免闪一下抽屉布局
  return screens.md === false
}
