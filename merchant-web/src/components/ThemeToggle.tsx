import { Dropdown, Button, Tooltip } from 'antd'
import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { type ThemeMode, useThemeStore } from '../store/theme'

const LABELS: Record<ThemeMode, string> = { light: '浅色', dark: '深色', system: '跟随系统' }

/** 外观切换：浅色 / 深色 / 跟随系统 */
export default function ThemeToggle({ size }: { size?: 'small' | 'middle' }) {
  const { mode, isDark, setMode } = useThemeStore()
  const icon = mode === 'system' ? <DesktopOutlined /> : isDark ? <MoonOutlined /> : <SunOutlined />
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        selectedKeys: [mode],
        items: [
          { key: 'light', icon: <SunOutlined />, label: LABELS.light },
          { key: 'dark', icon: <MoonOutlined />, label: LABELS.dark },
          { key: 'system', icon: <DesktopOutlined />, label: LABELS.system },
        ],
        onClick: ({ key }) => setMode(key as ThemeMode),
      }}
    >
      <Tooltip title={`外观：${LABELS[mode]}`}>
        <Button type="text" size={size} icon={icon} aria-label="切换外观" />
      </Tooltip>
    </Dropdown>
  )
}
