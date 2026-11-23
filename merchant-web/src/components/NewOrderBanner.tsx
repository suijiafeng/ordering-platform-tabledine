import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { App, Button } from 'antd'
import { BellOutlined, CloseOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { acceptOrder, getOrder } from '../api/order'
import type { OrderDetail } from '../api/types'
import { formatYuan } from '../utils/money'
import { ignoreShownError } from '../utils/errors'
import { useOrderEvents } from '../store/orderEvents'
import ConfirmButton from './ConfirmButton'
import { useIsMobile } from '../hooks/useIsMobile'

dayjs.extend(relativeTime)

const DISMISS_KEY = 'merchant_banner_dismissed'

function readDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** 横幅首行的菜品摘要：最多两道，其余用「等 N 道」 */
export function summarizeItems(order: Pick<OrderDetail, 'items'>): string {
  const parts = order.items.slice(0, 2).map((i) => `${i.dishName}${i.specDesc ? `(${i.specDesc})` : ''} ×${i.quantity}`)
  const rest = order.items.length - parts.length
  return parts.join('、') + (rest > 0 ? ` 等 ${order.items.length} 道` : '')
}

/**
 * 待接单横幅（R4）：放在内容区顶部、随页面滚动，不再用右下角浮层压住抽屉 / 表格按钮。
 * 只要还有待接单就显示最新一单；点 × 后这批订单不再提示，来了新单会重新出现。
 */
export default function NewOrderBanner({ pendingOrderNos, latestHint, onChanged }: {
  /** 当前所有待接单单号（轮询接口返回） */
  pendingOrderNos: string[]
  /** 最近一次到达的新单（优先展示） */
  latestHint?: string
  onChanged?: () => void
}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isMobile = useIsMobile()
  const { message } = App.useApp()
  const bump = useOrderEvents((s) => s.bump)
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [acting, setActing] = useState(false)

  const visible = pendingOrderNos.filter((no) => !dismissed.has(no))
  const latest = latestHint && visible.includes(latestHint) ? latestHint : visible[visible.length - 1]

  useEffect(() => {
    if (!latest) {
      setDetail(null)
      return
    }
    let alive = true
    getOrder(latest, { silent: true })
      .then((d) => { if (alive) setDetail(d) })
      .catch(() => { if (alive) setDetail(null) })
    return () => { alive = false }
  }, [latest])

  // 工作台有「待处理」卡片、后厨页有自己的队列、代客下单页正在录单：这三处不显示；
  // 手机订单页本身就是按状态排的卡片，横幅会把第一张卡片重复一遍，也不显示
  if (!latest || pathname === '/' || pathname.startsWith('/kitchen') || pathname === '/orders/new' || (isMobile && pathname === '/orders')) return null

  const dismiss = () => {
    const next = new Set([...dismissed, ...pendingOrderNos])
    setDismissed(next)
    try { sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...next])) } catch { /* 隐私模式 */ }
  }
  const accept = async () => {
    setActing(true)
    try {
      await acceptOrder(latest)
      message.success(`已接单${detail?.tableCode ? ` · ${detail.tableCode} 桌` : ''}`)
      bump()
      onChanged?.()
    } catch (e) {
      ignoreShownError(e)
    } finally {
      setActing(false)
    }
  }
  const others = visible.length - 1
  const ready = detail?.orderNo === latest && detail.status === 'PAID'

  return (
    <div className="td-order-banner" role="status" aria-live="polite">
      <span className="td-order-banner-icon"><BellOutlined /></span>
      <div className="td-order-banner-body">
        <span className="td-order-banner-title">
          新订单{ready ? ` · ${detail.tableCode ? `${detail.tableCode} 桌` : '外带'} ${formatYuan(detail.payAmount)}` : ''}
        </span>
        <span className="td-order-banner-desc">
          {ready ? `${summarizeItems(detail)} · ${dayjs(detail.paidAt ?? detail.createdAt).fromNow()}` : `订单号 ${latest}`}
          {others > 0 && ` · 另有 ${others} 单待接单`}
        </span>
      </div>
      <div className="td-order-banner-actions">
        {ready && (
          <ConfirmButton type="primary" size="small" loading={acting} confirmText={`确认接单${detail.tableCode ? `（${detail.tableCode} 桌）` : ''}？`} onConfirm={() => void accept()}>
            接单
          </ConfirmButton>
        )}
        <Button size="small" onClick={() => navigate(`/orders?status=PAID&orderNo=${latest}`)}>查看</Button>
      </div>
      <Button className="td-order-banner-close" size="small" type="text" icon={<CloseOutlined />} aria-label="关闭新订单提示" onClick={dismiss} />
    </div>
  )
}
