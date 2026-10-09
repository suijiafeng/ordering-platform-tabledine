import { BellOutlined, CheckOutlined, DeleteOutlined } from '@ant-design/icons'
import { Badge, Button, Empty, Popover, Space, Typography, theme as antdTheme } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotificationStore } from '../store/notifications'

const KIND_LABEL = { ORDER: '订单', REFUND: '退款', SYSTEM: '系统' }

function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const { token } = antdTheme.useToken()
  const [open, setOpen] = useState(false)
  const messages = useNotificationStore((state) => state.messages)
  const markRead = useNotificationStore((state) => state.markRead)
  const markAllRead = useNotificationStore((state) => state.markAllRead)
  const clear = useNotificationStore((state) => state.clear)
  const unread = messages.some((item) => !item.read)

  const content = <div style={{ width: 340, maxWidth: 'calc(100vw - 32px)' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <Typography.Text strong>消息中心</Typography.Text>
      {messages.length > 0 && <Space size={2}>
        {unread && <Button type="text" size="small" icon={<CheckOutlined />} onClick={markAllRead}>全部已读</Button>}
        <Button type="text" size="small" icon={<DeleteOutlined />} onClick={clear}>清空</Button>
      </Space>}
    </div>
    <div style={{ maxHeight: 420, overflowY: 'auto' }}>
      {messages.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无消息" /> : messages.map((item) => <button
        key={item.id}
        type="button"
        onClick={() => { markRead(item.id); if (item.link) { setOpen(false); navigate(item.link) } }}
        style={{ display: 'block', width: '100%', padding: '12px 10px', border: 0, borderBottom: `1px solid ${token.colorSplit}`, borderInlineStart: `3px solid ${item.read ? 'transparent' : token.colorPrimary}`, background: item.read ? 'transparent' : token.colorPrimaryBg, color: token.colorText, textAlign: 'left', cursor: 'pointer', opacity: item.read ? 0.76 : 1 }}
      >
        <Space size={8} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Space size={6}><Typography.Text strong={!item.read}>{item.title}</Typography.Text>{!item.read && <Badge status="processing" text="未读" />}</Space>
          <Typography.Text type="secondary" style={{ flexShrink: 0, fontSize: 12 }}>{KIND_LABEL[item.kind]} · {formatTime(item.createdAt)}</Typography.Text>
        </Space>
        <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 13 }}>{item.description}</Typography.Paragraph>
      </button>)}
    </div>
  </div>

  return <Popover content={content} trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen}>
    <Badge dot={unread} offset={[-5, 5]}><Button type="text" icon={<BellOutlined />} aria-label="消息中心" /></Badge>
  </Popover>
}
