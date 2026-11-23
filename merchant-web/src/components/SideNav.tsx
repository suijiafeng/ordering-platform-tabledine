import { Tooltip } from 'antd'
import { MenuFoldOutlined, MenuUnfoldOutlined, RightOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import BrandLogo from './BrandLogo'
import { activeNavKey, visibleGroups } from '../layouts/nav'
import { useAuthStore } from '../store/auth'
import { useStoreInfo } from '../store/storeInfo'

export interface SideNavProps {
  collapsed?: boolean
  /** 不传则不显示底部折叠按钮（手机抽屉里） */
  onToggle?: () => void
  /** 菜单角标：返回 0 不显示；hot 为橙色强调（需要立即处理） */
  badgeFor: (key: string) => { count: number; hot?: boolean }
  onNavigate?: () => void
}

/**
 * 分组侧栏（R4）：品牌 + 店铺营业状态 + 分组菜单 + 折叠按钮。
 * 折叠后分组名变成分隔线，菜单只留图标，悬停显示名称，角标挪到图标右上角。
 */
export default function SideNav({ collapsed = false, onToggle, badgeFor, onNavigate }: SideNavProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const role = useAuthStore((s) => s.staff?.role)
  const store = useStoreInfo((s) => s.store)
  const active = activeNavKey(pathname)
  const go = (key: string) => {
    navigate(key)
    onNavigate?.()
  }
  const open = store?.businessStatus === 1
  const storeText = store ? `${store.name} · ${open ? '营业中' : '已暂停'}` : '店铺信息加载中'

  return (
    <div className={`td-sider${collapsed ? ' is-collapsed' : ''}`}>
      <button type="button" className="td-brand" onClick={() => go(role === 'KITCHEN' ? '/kitchen' : '/')} aria-label="回到首页">
        <BrandLogo size={30} showName={!collapsed} showSubtitle inverted />
      </button>
      <Tooltip title={collapsed ? storeText : undefined} placement="right">
        <button
          type="button"
          className="td-store"
          aria-label={storeText}
          // 只有店主能改营业状态；其他角色只看
          onClick={role === 'OWNER' ? () => go('/settings') : undefined}
          style={{ cursor: role === 'OWNER' ? 'pointer' : 'default' }}
        >
          <span className={`td-store-dot${store && !open ? ' is-off' : ''}`} />
          <span className="td-store-text">{storeText}</span>
          {role === 'OWNER' && <RightOutlined className="td-store-arrow" />}
        </button>
      </Tooltip>
      <nav className="td-nav" aria-label="主菜单">
        {visibleGroups(role).map((g) => (
          <div key={g.label} role="group" aria-label={g.label}>
            <div className="td-nav-group">{g.label}</div>
            {g.items.map((i) => {
              const { count, hot } = badgeFor(i.key)
              const selected = active === i.key
              const btn = (
                <button
                  type="button"
                  className={`td-nav-item${selected ? ' is-active' : ''}`}
                  aria-current={selected ? 'page' : undefined}
                  aria-label={count > 0 ? `${i.label}（${count} 项待处理）` : i.label}
                  onClick={() => go(i.key)}
                >
                  <span className="td-nav-icon">{i.icon}</span>
                  <span className="td-nav-label">{i.label}</span>
                  {count > 0 && <span className={`td-nav-badge${hot ? ' is-hot' : ''}`}>{count > 99 ? '99+' : count}</span>}
                </button>
              )
              return collapsed ? <Tooltip key={i.key} title={i.label} placement="right">{btn}</Tooltip> : <div key={i.key}>{btn}</div>
            })}
          </div>
        ))}
      </nav>
      {onToggle && (
        <div className="td-sider-foot">
          <button type="button" className="td-collapse" onClick={onToggle} aria-label={collapsed ? '展开侧栏' : '收起侧栏'}>
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            {!collapsed && <span>收起菜单</span>}
          </button>
        </div>
      )}
    </div>
  )
}
