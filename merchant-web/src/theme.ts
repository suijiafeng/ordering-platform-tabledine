import { theme as antdTheme, type ThemeConfig } from 'antd'

/**
 * 商家端令牌：单一强调色（国际橙），中性灰白底，8 / 12 / 6 圆角阶梯。
 * 只改 token，不改组件结构。状态色只用于成功 / 警告 / 错误，不拿来做装饰。
 */
export const BRAND_PRIMARY = '#E8590C'
/** 浅色侧栏与页面同属一个中性面，靠 1px 分割线区分 */
export const SIDER_BG = '#FFFFFF'

const shared: ThemeConfig['token'] = {
  colorPrimary: BRAND_PRIMARY,
  colorInfo: '#52525B',
  colorSuccess: '#3F6212',
  colorWarning: '#B45309',
  colorError: '#B91C1C',
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
  colorText: '#18181B',
  colorTextSecondary: '#52525B',
  colorTextTertiary: '#71717A',
  colorTextQuaternary: '#A1A1AA',
  colorBorder: '#E4E4E7',
  colorBorderSecondary: '#E4E4E7',
  colorSplit: '#F4F4F5',
  colorBgLayout: '#FAFAFA',
  colorFillAlter: '#FAFAFA',
}

const buttonComponent: NonNullable<ThemeConfig['components']>['Button'] = {
  fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none', borderRadius: 6,
}
const cardComponent: NonNullable<ThemeConfig['components']>['Card'] = { borderRadiusLG: 12 }
const modalComponent: NonNullable<ThemeConfig['components']>['Modal'] = { borderRadiusLG: 12 }

/** 侧栏：白底、1px 选中，不铺满橙色块 */
const siderComponents: ThemeConfig['components'] = {
  Layout: { siderBg: SIDER_BG, triggerBg: SIDER_BG, headerBg: '#FFFFFF', bodyBg: '#FAFAFA' },
  Menu: {
    itemBg: SIDER_BG,
    itemSelectedBg: '#FFF4EC',
    itemSelectedColor: BRAND_PRIMARY,
    itemColor: '#3F3F46',
    itemHoverColor: '#18181B',
    itemBorderRadius: 6,
    itemMarginInline: 8,
    itemHeight: 36,
  },
  Card: cardComponent,
  Modal: modalComponent,
  Button: buttonComponent,
  Table: { headerBg: '#FAFAFA', headerColor: '#71717A', headerSplitColor: 'transparent', rowHoverBg: '#FAFAFA' },
  Segmented: { itemSelectedBg: '#18181B', itemSelectedColor: '#FFFFFF', borderRadius: 6, borderRadiusSM: 6, trackPadding: 2 },
}

const darkSider: ThemeConfig['components'] = {
  Layout: { siderBg: '#09090B', triggerBg: '#09090B' },
  Menu: {
    darkItemBg: '#09090B',
    darkSubMenuItemBg: '#09090B',
    darkItemSelectedBg: 'rgba(232,89,12,0.18)',
    darkItemSelectedColor: '#FDBA74',
    darkItemColor: 'rgba(255,255,255,0.72)',
    darkItemHoverColor: '#FFFFFF',
    itemBorderRadius: 6,
    itemMarginInline: 8,
    itemHeight: 36,
  },
}

export function buildTheme(isDark: boolean): ThemeConfig {
  if (isDark) {
    return {
      algorithm: antdTheme.darkAlgorithm,
      token: { ...shared, colorBgBase: '#09090B' },
      components: {
        ...siderComponents,
        ...darkSider,
        Button: buttonComponent,
        Card: cardComponent,
        Modal: modalComponent,
        Table: { headerSplitColor: 'transparent' },
        Segmented: { itemSelectedBg: BRAND_PRIMARY, itemSelectedColor: '#FFFFFF', borderRadius: 6, borderRadiusSM: 6, trackPadding: 2 },
      },
    }
  }
  return { algorithm: antdTheme.defaultAlgorithm, token: lightToken, components: siderComponents }
}
