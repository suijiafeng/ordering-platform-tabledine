import { useNavigate } from 'react-router-dom'
import { App, Avatar, Dropdown, Space, Tag, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { DownOutlined, LogoutOutlined } from '@ant-design/icons'
import { useAuthStore } from '../store/auth'
import { ROLE_META } from '../utils/auth'

/** 顶栏右侧用户菜单（简化版）：头像 + 姓名，下拉可退出登录。修改密码随员工管理提交补全 */
export default function UserMenu({ compact }: { compact?: boolean }) {
  const navigate = useNavigate()
  const { modal } = App.useApp()
  const { staff, logout } = useAuthStore()
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
            {staff && <Tag color={ROLE_META[staff.role].color} style={{ marginInlineEnd: 0 }}>{ROLE_META[staff.role].label}</Tag>}
          </Space>
          <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>账号：{staff?.username}</Typography.Text></div>
        </div>
      ),
    },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ]

  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') {
      modal.confirm({
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
    <Dropdown menu={{ items, onClick }} trigger={['click']}>
      <Space style={{ cursor: 'pointer' }}>
        <Avatar size={compact ? 'small' : 'default'}>{name.slice(0, 1)}</Avatar>
        {!compact && <Typography.Text>{name}</Typography.Text>}
        <DownOutlined style={{ fontSize: 12 }} />
      </Space>
    </Dropdown>
  )
}
