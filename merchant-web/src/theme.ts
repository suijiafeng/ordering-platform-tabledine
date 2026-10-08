import { theme as antdTheme, type ThemeConfig } from 'antd'

/**
 * 商家端设计令牌（对应 Figma「点餐后台·商家端重设计」）：火焰橙主色、暖灰中性色、12–16 圆角、弹窗用阴影不用描边。
 * 只改 token，不改组件结构；深色模式沿用 antd 暗色算法，仅替换主色与侧栏底色。
 */
export const BRAND_PRIMARY = '#E8590C'
/** 侧栏深色底（深浅主题共用） */
export const SIDER_BG = '#211913'

const shared: ThemeConfig['token'] = {
  colorPrimary: BRAND_PRIMARY,
  colorInfo: '#2563EB',
  colorSuccess: '#16A34A',
  colorWarning: '#D97706',
  colorError: '#DC2626',
  colorLink: BRAND_PRIMARY,
  borderRadius: 8,
  borderRadiusLG: 12,
  borderRadiusSM: 6,
  controlHeight: 36,
  controlHeightLG: 44,
  fontFamily: `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', 'Segoe UI', Roboto, sans-serif`,
}

const lightToken: ThemeConfig['token'] = {
  ...shared,
  colorText: '#292524',
  colorTextSecondary: '#78716C',
  colorTextTertiary: '#A8A29E',
  // 占位符 / 禁用文字用它：比设计稿的 #D6CFC7 深一档，保证白底上可读
  colorTextQuaternary: '#BDB5AC',
  colorBorder: '#E7E2DC',
  colorBorderSecondary: '#EFE9E1',
  colorSplit: '#EFE9E1',
  colorBgLayout: '#F6F4F1',
  colorFillAlter: '#F6F4F1',
}

/** 侧栏菜单：深色底 + 橙色选中，深浅主题一致 */
const siderComponents: ThemeConfig['components'] = {
  Layout: { siderBg: SIDER_BG, triggerBg: SIDER_BG },
  Menu: {
    darkItemBg: SIDER_BG,
    darkSubMenuItemBg: SIDER_BG,
    darkItemSelectedBg: BRAND_PRIMARY,
    darkItemColor: 'rgba(255,255,255,0.68)',
    darkItemHoverColor: '#FFFFFF',
    itemBorderRadius: 8,
    itemMarginInline: 10,
  },
  Card: { borderRadiusLG: 12 },
  Modal: { borderRadiusLG: 16 },
  Button: { fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none' },
  Table: { headerBg: '#FFFFFF', headerColor: '#A8A29E', headerSplitColor: 'transparent', rowHoverBg: '#FDF6F0' },
  Segmented: { itemSelectedBg: '#292524', itemSelectedColor: '#FFFFFF', borderRadius: 20, borderRadiusSM: 16, trackPadding: 4 },
}

export function buildTheme(isDark: boolean): ThemeConfig {
  if (isDark) {
    return {
      algorithm: antdTheme.darkAlgorithm,
      token: shared,
      components: {
        ...siderComponents,
        Table: { headerSplitColor: 'transparent' },
        Segmented: { itemSelectedBg: BRAND_PRIMARY, itemSelectedColor: '#FFFFFF', borderRadius: 20, borderRadiusSM: 16, trackPadding: 4 },
      },
    }
  }
  return { algorithm: antdTheme.defaultAlgorithm, token: lightToken, components: siderComponents }
}
