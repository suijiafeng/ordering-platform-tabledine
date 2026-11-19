import { theme as antdTheme, type ThemeConfig } from 'antd'

/**
 * 商家端令牌：火焰橙主色、暖灰表面，沿用界面收紧后的圆角和轻阴影。
 * 只改颜色，不改组件结构。
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
  controlHeightLG: 40,
  fontFamily: `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', 'Segoe UI', Roboto, sans-serif`,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  boxShadowSecondary: '0 1px 2px rgba(0,0,0,0.06)',
}

const lightToken: ThemeConfig['token'] = {
  ...shared,
  colorText: '#292524',
  colorTextSecondary: '#78716C',
  colorTextTertiary: '#A8A29E',
  // 占位符 / 禁用文字：比设计稿的 #D6CFC7 深一档，保证白底上可读
  colorTextQuaternary: '#BDB5AC',
  colorBorder: '#E7E2DC',
  colorBorderSecondary: '#EFE9E1',
  colorSplit: '#EFE9E1',
  colorBgLayout: '#F6F4F1',
  colorFillAlter: '#F6F4F1',
}

const buttonComponent: NonNullable<ThemeConfig['components']>['Button'] = {
  fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none', borderRadius: 6,
}
const cardComponent: NonNullable<ThemeConfig['components']>['Card'] = { borderRadiusLG: 12 }
const modalComponent: NonNullable<ThemeConfig['components']>['Modal'] = { borderRadiusLG: 12 }

/** 侧栏：深色底 + 橙色选中。圆角仍用收紧后的 6px，不恢复胶囊。 */
const siderComponents: ThemeConfig['components'] = {
  Layout: { siderBg: SIDER_BG, triggerBg: SIDER_BG, headerBg: '#FFFFFF', bodyBg: '#F6F4F1' },
  Menu: {
    darkItemBg: SIDER_BG,
    darkSubMenuItemBg: SIDER_BG,
    darkItemSelectedBg: BRAND_PRIMARY,
    darkItemSelectedColor: '#FFFFFF',
    darkItemColor: 'rgba(255,255,255,0.68)',
    darkItemHoverColor: '#FFFFFF',
    itemBorderRadius: 6,
    itemMarginInline: 8,
    itemHeight: 36,
  },
  Card: cardComponent,
  Modal: modalComponent,
  Button: buttonComponent,
  Table: { headerBg: '#FFFFFF', headerColor: '#A8A29E', headerSplitColor: 'transparent', rowHoverBg: '#FDF6F0' },
  Segmented: { itemSelectedBg: '#292524', itemSelectedColor: '#FFFFFF', borderRadius: 6, borderRadiusSM: 6, trackPadding: 2 },
}

export function buildTheme(isDark: boolean): ThemeConfig {
  if (isDark) {
    return {
      algorithm: antdTheme.darkAlgorithm,
      token: shared,
      components: {
        ...siderComponents,
        Table: { headerSplitColor: 'transparent' },
        Segmented: { itemSelectedBg: BRAND_PRIMARY, itemSelectedColor: '#FFFFFF', borderRadius: 6, borderRadiusSM: 6, trackPadding: 2 },
      },
    }
  }
  return { algorithm: antdTheme.defaultAlgorithm, token: lightToken, components: siderComponents }
}
