import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Dropdown, Modal, Space, Tag, Typography, theme as antdTheme } from 'antd'
import type { MenuProps } from 'antd'
import { DownOutlined, KeyOutlined, LogoutOutlined, ShopOutlined, TeamOutlined } from '@ant-design/icons'
import { useAuthStore } from '../store/auth'
import ChangePasswordModal from './ChangePasswordModal'

/** 顶栏右侧用户菜单：头像 + 姓名，下拉展示身份信息与账号操作 */
export default function UserMenu({ compact }: { compact?: boolean }) {
  const navigate = useNavigate()
  const { token } = antdTheme.useToken()
  const { staff, logout } = useAuthStore()
  const [pwdOpen, setPwdOpen] = useState(false)
  const isOwner = staff?.role === 'OWNER'
  const name = staff?.name ?? ''

  const items: MenuProps['items'] = [
    {
      key: 'profile',
      disabled: true,
      style: { cursor: 'default' },
      label: (
        <div style={{ padding: '4px 0', minWidth: 160 }}>
          <Space size={6}>
            <Typography.Text strong>{name}</Typography.Text>
            <Tag color={isOwner ? 'gold' : 'blue'} style={{ marginInlineEnd: 0 }}>{isOwner ? '店主' : '店员'}</Tag>
          </Space>
          <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>账号：{staff?.username}</Typography.Text></div>
        </div>
      ),
    },
    { type: 'divider' },
    ...(isOwner
      ? [
          { key: 'settings', icon: <ShopOutlined />, label: '店铺设置' },
          { key: 'staff', icon: <TeamOutlined />, label: '员工管理' },
          { type: 'divider' as const },
        ]
      : []),
    { key: 'password', icon: <KeyOutlined />, label: '修改密码' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ]

  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'settings') navigate('/settings')
    if (key === 'staff') navigate('/staff')
    if (key === 'password') setPwdOpen(true)
    if (key === 'logout') {
      Modal.confirm({
        title: '确认退出登录？',
        okText: '退出',
        cancelText: '取消',
        onOk: () => {
          logout()
          navigate('/login', { replace: true })
        },
      })
    }
  }

  return (
    <>
      <Dropdown menu={{ items, onClick }} trigger={['click']} placement="bottomRight">
        <Space
          size={6}
          role="button"
          aria-label="用户菜单"
          style={{ cursor: 'pointer', padding: '0 8px', height: 40, borderRadius: token.borderRadius, lineHeight: 1 }}
        >
          <Avatar size={compact ? 26 : 28} style={{ background: isOwner ? token.colorWarning : token.colorPrimary, flexShrink: 0 }}>
            {name.slice(0, 1)}
          </Avatar>
          {!compact && <Typography.Text>{name}</Typography.Text>}
          <DownOutlined style={{ fontSize: 10, color: token.colorTextTertiary }} />
        </Space>
      </Dropdown>
      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </>
  )
}
