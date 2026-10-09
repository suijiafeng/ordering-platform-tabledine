import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Card, Col, Empty, Row, Select, Space, Switch, Tag, Typography, theme as antdTheme } from 'antd'
import { CheckOutlined, FireOutlined, SoundOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { kitchenQueue, readyOrder, startCooking } from '../../api/order'
import type { OrderSummary } from '../../api/types'
import { usePollStore } from '../../hooks/useOrderPoll'
import { playSound, useSoundStore } from '../../utils/sound'
import OrderDetailDrawer from '../orders/OrderDetailDrawer'
import { ignoreShownError } from '../../utils/errors'
import { useIsKitchen } from '../../utils/auth'
import ConfirmButton from '../../components/ConfirmButton'

const REFRESH_MS = 5000

/**
 * 后厨看板的三个阶段（只看前厅已确认的订单）：
 * 待制作（制作中、尚未点开始）→ 制作中（已点开始制作）→ 待取餐（已出餐，等前厅取走送达，只读）
 */
type Stage = 'TODO' | 'COOKING' | 'DONE'

function stageOf(o: OrderSummary): Stage {
  if (o.status === 'READY') return 'DONE'
  return o.cookingStartedAt ? 'COOKING' : 'TODO'
}

/** 各阶段的计时起点与超时阈值（分钟）：接单后 5 分钟没开始做、开始后 20 分钟没做完、做好 5 分钟没被取走，都高亮 */
const STAGE_META: Record<Stage, { label: string; since: (o: OrderSummary) => string | null; overdueMin: number; sinceText: string }> = {
  TODO: { label: '待制作', since: (o) => o.acceptedAt, overdueMin: 5, sinceText: '已等待' },
  COOKING: { label: '制作中', since: (o) => o.cookingStartedAt ?? o.acceptedAt, overdueMin: 20, sinceText: '已制作' },
  DONE: { label: '待取餐', since: (o) => o.readyAt, overdueMin: 5, sinceText: '已等待' },
}

function minutesSince(from: string | null): number {
  return from ? dayjs().diff(dayjs(from), 'minute') : 0
}

function isOverdue(o: OrderSummary): boolean {
  const meta = STAGE_META[stageOf(o)]
  return minutesSince(meta.since(o)) >= meta.overdueMin
}

/** 超时订单置顶，其余保持后端给的先来后到顺序（sort 是稳定排序） */
function overdueFirst(list: OrderSummary[]): OrderSummary[] {
  return [...list].sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)))
}

function elapsed(from: string | null): string {
  if (!from) return ''
  const m = minutesSince(from)
  return m < 1 ? '刚刚' : `${m} 分钟`
}

/**
 * 后厨队列：只显示前厅（或自动接单）确认过的订单，分「待制作 / 制作中 / 待取餐」三栏，大字体卡片一键流转；5 秒自动刷新。
 * 权责分离：接单 / 拒单 / 送达由前厅在订单管理处理，后厨只负责制作。
 * 长期值守界面：显示最后同步时间，断线明确提示，恢复后自动刷新，超时订单高亮，未接单持续提醒。
 */
export default function KitchenPage() {
  const { message } = App.useApp()
  const [orders, setOrders] = useState<OrderSummary[]>([])
  // 正在处理的订单号集合：连续点不同订单时，先完成的那单不会把后一单的加载状态清掉
  const [acting, setActing] = useState<ReadonlySet<string>>(new Set())
  const [detail, setDetail] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [failures, setFailures] = useState(0)
  const [, setTick] = useState(0)
  const { remindIntervalMs, setRemindInterval } = usePollStore()
  const { enabled: soundEnabled, setEnabled: setSoundEnabled } = useSoundStore()
  const { token } = antdTheme.useToken()
  const isKitchen = useIsKitchen()
  const wasOffline = useRef(false)
  // 同一时刻只有一次请求在路上：定时轮询不能靠「只采纳最新请求」去重——
  // 后端慢于轮询间隔时每个响应都会被当成过期丢掉，看板就永远停在旧数据上
  const inFlight = useRef(false)
  // 请求进行中又有人要刷新（如刚点完接单）：不能直接丢掉，记下来等当前请求结束后再拉一次
  const reloadPending = useRef(false)
  // 每次接单 / 出餐 / 送达后递增：在操作之前发出的请求返回的是旧快照，不能用它覆盖队列（否则卡片会短暂跳回原状态）
  const dataVersion = useRef(0)

  const load = useCallback(async () => {
    if (inFlight.current) {
      reloadPending.current = true
      return
    }
    inFlight.current = true
    try {
      do {
        reloadPending.current = false
        const version = dataVersion.current
        try {
          const list = await kitchenQueue()
          if (version !== dataVersion.current) {
            // 请求期间有操作完成，这份数据已过期：丢弃并重新拉取
            reloadPending.current = true
            continue
          }
          setOrders(list)
          setLastSync(new Date())
          setFailures(0)
          if (wasOffline.current) {
            wasOffline.current = false
            message.success('已重新连接，队列已刷新')
          }
        } catch {
          setFailures((n) => n + 1)
          wasOffline.current = true
        }
      } while (reloadPending.current)
    } finally {
      inFlight.current = false
    }
  }, [message])

  useEffect(() => {
    // 上一轮结束后再安排下一轮（间隔从响应返回算起），请求慢时轮询自然变慢而不是互相作废
    let timer: number | undefined
    let stopped = false
    const poll = async () => {
      if (document.visibilityState === 'visible') {
        await load()
        setTick((t) => t + 1)
      }
      if (!stopped) timer = window.setTimeout(() => { void poll() }, REFRESH_MS)
    }
    void poll()
    // 从后台切回来立刻刷新一次
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const act = async (o: OrderSummary) => {
    if (acting.has(o.orderNo)) return
    setActing((s) => new Set(s).add(o.orderNo))
    try {
      if (stageOf(o) === 'TODO') {
        await startCooking(o.orderNo)
        message.success(`桌 ${o.tableCode ?? ''} 开始制作`)
      } else {
        // 制作完成即出餐，进入待取餐；取餐送达由前厅在订单管理完成
        await readyOrder(o.orderNo)
        message.success(`桌 ${o.tableCode ?? ''} 制作完成，等待前厅取餐`)
      }
      playSound('actionDone')
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    } finally {
      // 无论成功与否，服务端状态都可能已变化：作废进行中的旧请求，再拉一次最新队列
      dataVersion.current += 1
      setActing((s) => {
        const next = new Set(s)
        next.delete(o.orderNo)
        return next
      })
      void load()
    }
  }

  // 后厨队列只有前厅（或自动接单）确认过的订单，按阶段分三栏；每栏超时的置顶
  const byStage = (st: Stage) => overdueFirst(orders.filter((o) => stageOf(o) === st))
  const columns: { stage: Stage; list: OrderSummary[]; color: string; empty: string }[] = [
    { stage: 'TODO', list: byStage('TODO'), color: token.colorWarning, empty: '前厅确认订单后会出现在这里' },
    { stage: 'COOKING', list: byStage('COOKING'), color: token.colorInfo, empty: '点「开始制作」后移到这里' },
    { stage: 'DONE', list: byStage('DONE'), color: token.colorSuccess, empty: '做好的菜在这里等前厅取餐' },
  ]
  const offline = failures > 0 && (lastSync === null || failures >= 2)

  // 新出现的超时订单响一次（同一单同一阶段只响一次）；打开看板时已经超时的只建立基线，不响
  const overdueKeys = orders.filter(isOverdue).map((o) => `${o.orderNo}:${stageOf(o)}`).sort().join(',')
  const notifiedOverdue = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (lastSync === null) return
    const keys = overdueKeys ? overdueKeys.split(',') : []
    const previous = notifiedOverdue.current
    notifiedOverdue.current = new Set(keys)
    if (previous && keys.some((k) => !previous.has(k))) playSound('kitchenOverdue')
  }, [overdueKeys, lastSync])

  const card = (o: OrderSummary) => {
    const st = stageOf(o)
    const meta = STAGE_META[st]
    const overdue = isOverdue(o)
    const done = st === 'DONE'
    // 顾客申请取消：前厅处理前不要开始做（后端也会拒绝）
    const cancelApplying = o.cancelRequestStatus === 'APPLYING'
    const color = st === 'TODO' ? token.colorWarning : st === 'COOKING' ? token.colorInfo : token.colorSuccess
    return (
      <Card
        key={o.id}
        size="small"
        style={{
          borderTop: `4px solid ${overdue ? token.colorError : color}`,
          borderRadius: 16,
          // 超时：整张卡片红框，比只改顶边更容易在远处看到
          boxShadow: overdue ? `0 0 0 2px ${token.colorError}` : undefined,
          opacity: done && !overdue ? 0.85 : 1,
        }}
        styles={{ body: { padding: done ? 16 : 20 } }}
        onClick={() => setDetail(o.orderNo)}
        // 键盘也能打开详情：Tab 聚焦卡片，回车 / 空格打开；卡片里的按钮自己处理按键
        tabIndex={0}
        role="button"
        aria-label={`桌 ${o.tableCode ?? '-'} ${meta.label}订单详情`}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setDetail(o.orderNo)
          }
        }}
        hoverable
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <Typography.Title level={2} style={{ margin: 0, fontSize: done ? 26 : 34 }}>{o.tableCode ?? '-'}</Typography.Title>
          <Typography.Text type={overdue ? 'danger' : 'secondary'} strong={overdue} style={{ fontSize: 14, textAlign: 'right' }}>
            {overdue && <Tag color="error" style={{ marginInlineEnd: 6 }}>超时</Tag>}
            {meta.sinceText} {elapsed(meta.since(o))}
          </Typography.Text>
        </div>
        {cancelApplying && (
          <div style={{ background: token.colorErrorBg, color: token.colorError, borderRadius: 8, padding: '6px 12px', marginTop: 8, fontSize: 16, fontWeight: 600 }}>
            顾客申请取消，等待前厅处理，先不要制作
          </div>
        )}
        <div style={{ margin: done ? '8px 0 0' : '12px 0', fontSize: done ? 15 : 20, lineHeight: 1.7 }}>
          {o.items.map((i) => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>
                {i.dishName}
                {!done && (i.specDesc || i.addonDesc) && <Typography.Text type="secondary" style={{ fontSize: 14, marginLeft: 6 }}>{[i.specDesc, i.addonDesc].filter(Boolean).join(' · ')}</Typography.Text>}
              </span>
              <Typography.Text strong style={{ fontSize: done ? 15 : 20 }}>×{i.quantity}</Typography.Text>
            </div>
          ))}
        </div>
        {!done && o.remark && (
          <div style={{ background: token.colorWarningBg, color: token.colorWarningText, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 16 }}>
            备注：{o.remark}
          </div>
        )}
        {!done && (
          <ConfirmButton
            type="primary"
            size="large"
            block
            danger={overdue}
            icon={st === 'TODO' ? <FireOutlined /> : <CheckOutlined />}
            loading={acting.has(o.orderNo)}
            disabled={cancelApplying}
            // 厨房油手 / 戴手套也能点准：按钮 ≥ 64px 高、大字号；点两次才执行，防止点错卡片
            style={{ height: 64, fontSize: 20, borderRadius: 12, background: overdue || st === 'TODO' ? undefined : token.colorSuccess }}
            confirmText={st === 'TODO' ? `再点一次：开始制作 ${o.tableCode ?? ''}` : `再点一次：${o.tableCode ?? ''} 制作完成`}
            onConfirm={() => void act(o)}
          >
            {cancelApplying ? '等待前厅处理' : st === 'TODO' ? '开始制作' : '制作完成'}
          </ConfirmButton>
        )}
      </Card>
    )
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Space size="large" wrap align="center">
          <Typography.Text type={offline ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
            {offline ? '连接中断，正在重试…' : lastSync ? `最后同步 ${dayjs(lastSync).format('HH:mm:ss')} · 每 5 秒刷新` : '正在连接…'}
          </Typography.Text>
        </Space>
        <Space wrap>
          <SoundOutlined />
          <Switch checked={soundEnabled} onChange={setSoundEnabled} checkedChildren="提示音开" unCheckedChildren="提示音关" />
          {/* 「未接单提醒」是前厅的事：后厨账号不显示 */}
          {!isKitchen && <Select
            size="small"
            value={remindIntervalMs}
            onChange={setRemindInterval}
            style={{ width: 150 }}
            options={[
              { value: 0, label: '未接单不重复提醒' },
              { value: 30_000, label: '未接单每 30 秒提醒' },
              { value: 60_000, label: '未接单每 1 分钟提醒' },
              { value: 180_000, label: '未接单每 3 分钟提醒' },
            ]}
          />}
          <Button size="small" onClick={() => playSound(isKitchen ? 'kitchenNewOrder' : 'newOrder', { force: true })}>试听</Button>
        </Space>
      </Space>

      {offline && (
        <Alert
          type="error"
          showIcon
          message="无法连接服务器"
          description={lastSync ? `当前显示的是 ${dayjs(lastSync).format('HH:mm:ss')} 的队列，可能已不是最新。恢复连接后会自动刷新。` : '尚未获取到队列，请检查网络或服务器。'}
          action={<Button size="small" onClick={() => void load()}>立即重试</Button>}
        />
      )}

      {lastSync === null && !offline ? (
        <Card loading />
      ) : (
        <Row gutter={[16, 16]} align="stretch">
          {columns.map((c) => (
            <Col key={c.stage} xs={24} lg={8}>
              <div style={{ background: token.colorFillQuaternary, borderRadius: 16, padding: 12, height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 12px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: c.color }} />
                  <Typography.Text strong style={{ fontSize: 18 }}>{STAGE_META[c.stage].label}</Typography.Text>
                  <Typography.Text strong style={{ fontSize: 18, color: c.color }}>{c.list.length}</Typography.Text>
                </div>
                {c.list.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={offline ? '连接中断' : c.empty} style={{ margin: '24px 0' }} />
                ) : (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>{c.list.map(card)}</Space>
                )}
              </div>
            </Col>
          ))}
        </Row>
      )}
      <OrderDetailDrawer orderNo={detail} open={!!detail} onClose={() => setDetail(null)} onChanged={() => { dataVersion.current += 1; void load() }} />
    </Space>
  )
}
