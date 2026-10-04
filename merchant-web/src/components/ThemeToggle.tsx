import { Button } from 'antd'
import { MoonOutlined, SunOutlined } from '@ant-design/icons'
import { useThemeStore } from '../store/theme'

/** 浅色 / 深色切换：图标与当前实际主题同步 */
export default function ThemeToggle({ size }: { size?: 'small' | 'middle' }) {
  const { isDark, toggle } = useThemeStore()
  return (
    <Button
      type="text"
      size={size}
      icon={isDark ? <MoonOutlined /> : <SunOutlined />}
      onClick={toggle}
      aria-label={isDark ? '切换到浅色' : '切换到深色'}
    />
  )
}
