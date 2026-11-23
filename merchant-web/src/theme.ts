import { theme as antdTheme, type ThemeConfig } from 'antd'

/**
 * 商家端令牌（R4 设计稿）：火焰橙主色、暖灰表面、8 / 12px 圆角、轻阴影。
 * 自定义外壳（侧栏、横幅、页签计数）通过 main.tsx 写到 :root 的 --td-* 变量取同一套颜色。
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
  // 主色浅底 / 描边：新订单横幅、待处理计数、选中态背景
  colorPrimaryBg: '#FFF4EC',
  colorPrimaryBorder: '#FFD8BF',
}

/**
 * 深色令牌（R4）：暖调近黑底，不用 antd 默认的冷灰。卡片 / 弹层逐级变亮，主色浅底换成深橙棕，
 * 让横幅、选中态、计数在深色下仍有层次。
 */
export const SIDER_BG_DARK = '#110D0A'
const darkToken: ThemeConfig['token'] = {
  ...shared,
  colorBgBase: '#17120E',
  colorTextBase: '#F5F0EB',
  colorBgLayout: '#17120E',
  colorBgContainer: '#211A15',
  colorBgElevated: '#2A221C',
  colorText: '#F5F0EB',
  colorTextSecondary: '#B5ABA2',
  colorTextTertiary: '#8A7F76',
  colorTextQuaternary: '#6B6159',
  colorBorder: '#3A3029',
  colorBorderSecondary: '#30271F',
  colorSplit: '#30271F',
  colorFillAlter: '#2A221C',
  colorPrimaryBg: '#3A2213',
  colorPrimaryBorder: '#6B3514',
  boxShadow: 'none',
  boxShadowSecondary: '0 6px 16px rgba(0,0,0,0.45)',
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
  Table: { headerBg: '#FAF8F5', headerColor: '#78716C', headerSplitColor: 'transparent', rowHoverBg: '#FDF6F0', cellPaddingBlock: 14, cellPaddingBlockMD: 12 },
  Tabs: { horizontalItemPadding: '14px 0', horizontalItemGutter: 28, itemColor: '#78716C', titleFontSize: 14 },
  Drawer: { footerPaddingBlock: 12, footerPaddingInline: 24 },
  Segmented: { itemSelectedBg: '#292524', itemSelectedColor: '#FFFFFF', borderRadius: 6, borderRadiusSM: 6, trackPadding: 2 },
}

export function buildTheme(isDark: boolean): ThemeConfig {
  if (isDark) {
    return {
      algorithm: antdTheme.darkAlgorithm,
      token: darkToken,
      components: {
        ...siderComponents,
        // 侧栏更深一档，和内容区拉开层次；内容区不要沿用浅色 bodyBg，否则深色文字算法会把字画成浅色
        Layout: { siderBg: SIDER_BG_DARK, triggerBg: SIDER_BG_DARK, headerBg: '#211A15', bodyBg: '#17120E' },
        Menu: { ...siderComponents?.Menu, darkItemBg: SIDER_BG_DARK, darkSubMenuItemBg: SIDER_BG_DARK },
        Table: { headerBg: '#2A221C', headerColor: '#B5ABA2', headerSplitColor: 'transparent', rowHoverBg: '#2A1F17', cellPaddingBlock: 14, cellPaddingBlockMD: 12 },
        Tabs: { horizontalItemPadding: '14px 0', horizontalItemGutter: 28, itemColor: '#B5ABA2', titleFontSize: 14 },
        Segmented: { itemSelectedBg: BRAND_PRIMARY, itemSelectedColor: '#FFFFFF', trackBg: '#2A221C', borderRadius: 6, borderRadiusSM: 6, trackPadding: 2 },
      },
    }
  }
  return { algorithm: antdTheme.defaultAlgorithm, token: lightToken, components: siderComponents }
}
