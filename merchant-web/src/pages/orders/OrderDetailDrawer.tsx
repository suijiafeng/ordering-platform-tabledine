import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Descriptions, Divider, Drawer, Input, Modal, Space, Spin, Table, Tag, Timeline, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { acceptOrder, approveCancelRequest, cancelOrder, deliverOrder, getOrder, readyOrder, rejectCancelRequest, rejectOrder, startCooking } from '../../api/order'
import type { OperatorType, OrderDetail, OrderItemView, OrderStatus, RefundView } from '../../api/types'
import { formatYuan } from '../../utils/money'
import { isRefundUnresolved, OPERATOR_TYPE, ORDER_STATUS, PAY_METHOD, PLATFORM, REFUND_INITIATOR, REFUND_TYPE } from '../../utils/orderStatus'
import { useIsKitchen, useIsOwner } from '../../utils/auth'
import MoneyText from '../../components/MoneyText'
import { OrderRefundTag, OrderStatusTag, RefundStatusTag } from '../../components/StatusTag'
import RefundModal from './RefundModal'
import SettleModal from './SettleModal'
import ConfirmButton from '../../components/ConfirmButton'
import { ignoreShownError } from '../../utils/errors'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Props {
  orderNo: string | null
  open: boolean
  onClose: () => void
  /** 订单发生变化后通知列表刷新 */
  onChanged?: () => void
  /** 只读：只看详情，不显示任何操作按钮（后厨在订单管理里查看订单时使用） */
  readOnly?: boolean
}

const fmt = (v: string | null | undefined) => (v ? dayjs(v).format('MM-DD HH:mm:ss') : '-')

/**
 * 时间线条目：状态日志 +「开始制作」（后厨开工不是订单状态变化，单独插入）。
 * 待接单 → 制作中 这条日志显示为「已接单」：接单后先是待制作，后厨开始后才是制作中。
 */
function timelineLogs(order: OrderDetail): { key: string; label: string; toStatus: OrderStatus; operatorType: OperatorType | null; operatorName: string | null; remark: string | null; createdAt: string }[] {
  const items = order.logs.map((l, i) => ({
    key: `log-${i}`,
    label: l.fromStatus === l.toStatus && l.remark?.startsWith('结账') ? '结账'
      : order.source === 'MERCHANT' && l.fromStatus == null ? (order.payMode === 'PAY_LATER' ? '代客下单（先吃后付）' : '代客下单')
      : order.source === 'MERCHANT' && l.fromStatus === 'PENDING_PAY' && l.toStatus === 'MAKING' ? '已收款并接单'
        : l.fromStatus === 'PAID' && l.toStatus === 'MAKING' ? '已接单' : ORDER_STATUS[l.toStatus]?.label ?? l.toStatus,
    toStatus: l.toStatus,
    operatorType: l.operatorType as OperatorType | null,
    operatorName: l.operatorName,
    remark: l.remark,
    createdAt: l.createdAt,
  }))
  if (order.cookingStartedAt) {
    items.push({ key: 'cooking', label: '开始制作', toStatus: 'MAKING', operatorType: null, operatorName: null, remark: '后厨开始制作', createdAt: order.cookingStartedAt })
    items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  return items
}

/** 先吃后付且还没结账（已取消的不算） */
function isUnsettled(order: OrderDetail): boolean {
  return order.payMode === 'PAY_LATER' && !order.paidAt && order.status !== 'CANCELLED' && order.status !== 'CLOSED'
}

/** 订单详情抽屉：明细、支付、退款、状态日志 + 履约操作（接单 / 拒单 / 出餐 / 送达 / 取消 / 退款） */
export default function OrderDetailDrawer({ orderNo, open, onClose, onChanged, readOnly = false }: Props) {
  const { message, modal } = App.useApp()
  const isOwner = useIsOwner()
  // 权责分离：后厨只能出餐；接单 / 拒单 / 送达由前厅（或店主）操作，后端同样会拒绝
  const isKitchen = useIsKitchen()
  const isMobile = useIsMobile()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [settleOpen, setSettleOpen] = useState(false)
  // reject 拒单 / cancel 店主整单取消 / rejectCancel 拒绝顾客的取消申请
  const [reasonModal, setReasonModal] = useState<'reject' | 'cancel' | 'rejectCancel' | null>(null)
  const [reason, setReason] = useState('')
  // 调用方传的是内联箭头函数，父页面每 5 秒轮询重渲染都会换一个新引用；
  // 若把 onClose 放进 load 的依赖，抽屉就会每 5 秒清空重拉。用 ref 持有最新回调。
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // 只采纳最后一次发起的加载：加载 A 时切到订单 B（如点了新订单通知），A 晚到的结果不能覆盖 B
  const loadSeq = useRef(0)
  const load = useCallback(async () => {
    if (!orderNo) {
      return
    }
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const detail = await getOrder(orderNo)
      if (seq === loadSeq.current) setOrder(detail)
    } catch (e) {
      // 打开详情失败（订单不存在 / 无权限）：请求层已提示，关闭抽屉回到列表
      if (seq === loadSeq.current) onCloseRef.current()
      ignoreShownError(e)
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [orderNo])

  useEffect(() => {
    if (open) {
      setOrder(null)
      void load()
    }
  }, [open, load])

  /** 返回是否成功 */
  const runOrderAction = async (fn: () => Promise<OrderDetail>, ok: string): Promise<boolean> => {
    setActing(true)
    // 操作期间切到了别的订单（如点了新订单通知）：结果不能覆盖抽屉里已经换成的那一单
    const seq = loadSeq.current
    try {
      const updated = await fn()
      if (seq === loadSeq.current) setOrder(updated)
      message.success(ok)
      onChanged?.()
      return true
    } catch (e) {
      // 操作失败（通常是状态已被别人改变）：请求层已提示，重新拉取详情让按钮与最新状态一致
      void load()
      ignoreShownError(e)
      return false
    } finally {
      setActing(false)
    }
  }

  const submitReason = async () => {
    if (!order || !reasonModal) {
      return
    }
    if ((reasonModal === 'cancel' || reasonModal === 'rejectCancel') && !reason.trim()) {
      message.warning(reasonModal === 'cancel' ? '请填写取消原因' : '请填写拒绝理由，顾客会看到')
      return
    }
    const kind = reasonModal
    setReasonModal(null)
    const ok = await runOrderAction(
      () => (kind === 'reject' ? rejectOrder(order.orderNo, reason.trim())
        : kind === 'rejectCancel' ? rejectCancelRequest(order.orderNo, reason.trim())
          : cancelOrder(order.orderNo, reason.trim())),
      kind === 'reject' ? '已拒单，退款处理中' : kind === 'rejectCancel' ? '已拒绝取消申请，订单继续制作' : '已取消，退款处理中')
    // 失败时保留已填写的原因，再次打开可以直接重试
    if (ok) setReason('')
  }

  const approveCancel = () => {
    if (!order) return
    modal.confirm({
      title: '同意顾客取消订单？',
      content: `订单将取消，实付 ${formatYuan(order.payAmount)} 全额退回顾客会员余额，后厨不再制作。`,
      okText: '同意取消并退款',
      okButtonProps: { danger: true },
      onOk: () => runOrderAction(() => approveCancelRequest(order.orderNo), '已同意取消，退款处理中'),
    })
  }

  const itemColumns: ColumnsType<OrderItemView> = [
    {
      title: '菜品',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{r.dishName}</Typography.Text>
          {(r.specDesc || r.addonDesc) && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{[r.specDesc, r.addonDesc].filter(Boolean).join(' · ')}</Typography.Text>
          )}
        </Space>
      ),
    },
    { title: '单价', dataIndex: 'unitPrice', width: 90, align: 'right', render: (v: number) => formatYuan(v) },
    { title: '数量', width: 80, align: 'right', render: (_, r) => (r.refundedQty > 0 ? <span>{r.quantity} <Typography.Text type="danger" style={{ fontSize: 12 }}>(退{r.refundedQty})</Typography.Text></span> : r.quantity) },
    { title: '小计', dataIndex: 'totalPrice', width: 100, align: 'right', render: (v: number) => <MoneyText fen={v} strong /> },
  ]

  const refundColumns: ColumnsType<RefundView> = [
    { title: '退款单号', dataIndex: 'refundNo', width: 190, render: (v: string) => <Typography.Text copyable style={{ fontSize: 12 }}>{v}</Typography.Text> },
    { title: '金额', dataIndex: 'amount', width: 90, render: (v: number) => <MoneyText fen={v} type="danger" /> },
    { title: '类型', width: 150, render: (_, r) => `${REFUND_TYPE[r.type]} · ${REFUND_INITIATOR[r.initiator]}` },
    { title: '状态', dataIndex: 'status', width: 100, render: (v: RefundView['status']) => <RefundStatusTag status={v} /> },
    {
      title: '说明',
      render: (_, r) => (
        <Space direction="vertical" size={0} style={{ fontSize: 12 }}>
          <span>{r.reason}</span>
          {r.items.length > 0 && <Typography.Text type="secondary">{r.items.map((i) => `${i.dishName}×${i.quantity}`).join('、')}</Typography.Text>}
          {r.failReason && <Typography.Text type={r.status === 'FAILED' ? 'danger' : 'secondary'}>{r.failReason}</Typography.Text>}
          {r.rejectReason && <Typography.Text type="secondary">拒绝理由：{r.rejectReason}</Typography.Text>}
          <Typography.Text type="secondary">{fmt(r.createdAt)}{r.operatorName ? ` · ${r.operatorName}` : ''}</Typography.Text>
        </Space>
      ),
    },
  ]

  const actions = () => {
    if (!order || readOnly) {
      return null
    }
    const s = order.status
    // 后端同一订单同一时刻只允许一笔未了结的退款，再发起会被拒
    const activeRefund = order.refunds.find((r) => isRefundUnresolved(r.status))
    const blockedTip = activeRefund ? `已有一笔退款${activeRefund.status === 'APPLYING' ? '待审核' : activeRefund.status === 'PROCESSING' ? '处理中' : '失败待处理'}，请先处理` : undefined
    // 需求 §4：商家主动退款仅店主
    // 先吃后付还没结账：钱没收，不能退款，只能结账或取消
    const unsettled = isUnsettled(order)
    const canRefund = isOwner && !unsettled && (s === 'MAKING' || s === 'READY' || s === 'DONE') && order.refundableAmount > 0
    const cancelApplying = order.cancelRequest?.status === 'APPLYING'
    return (
      <Space wrap>
        {unsettled && !isKitchen && (
          <Button type="primary" danger onClick={() => setSettleOpen(true)}>结账 {formatYuan(order.payAmount)}</Button>
        )}
        {s === 'PAID' && !isKitchen && (
          <>
            <ConfirmButton type="primary" loading={acting} confirmText="再点一次确认接单" onConfirm={() => void runOrderAction(() => acceptOrder(order.orderNo), '已接单')}>接单</ConfirmButton>
            <Button danger loading={acting} onClick={() => { setReason(''); setReasonModal('reject') }}>拒单并退款</Button>
          </>
        )}
        {s === 'MAKING' && cancelApplying && !isKitchen && (
          // 顾客申请取消：前厅 / 店主先处理，处理完之前后厨不能开始制作
          <>
            <Button type="primary" danger loading={acting} onClick={approveCancel}>同意取消并退款</Button>
            <Button loading={acting} onClick={() => { setReason(''); setReasonModal('rejectCancel') }}>拒绝取消</Button>
          </>
        )}
        {s === 'MAKING' && !cancelApplying && (
          // 与后厨看板一致：接单后先「开始制作」，再「制作完成」；旧版后端没有 cookingStartedAt 时直接出餐
          order.cookingStartedAt === null
            ? <ConfirmButton type="primary" loading={acting} confirmText="再点一次开始制作" onConfirm={() => void runOrderAction(() => startCooking(order.orderNo), '已开始制作')}>开始制作</ConfirmButton>
            : <ConfirmButton type="primary" loading={acting} confirmText="再点一次确认制作完成" onConfirm={() => void runOrderAction(() => readyOrder(order.orderNo), '制作完成，等待取餐')}>制作完成</ConfirmButton>
        )}
        {s === 'READY' && !isKitchen && (
          <ConfirmButton type="primary" loading={acting} confirmText="再点一次确认送达" onConfirm={() => void runOrderAction(() => deliverOrder(order.orderNo), '已送达')}>送达完成</ConfirmButton>
        )}
        {canRefund && <Tooltip title={blockedTip}><Button disabled={!!activeRefund} onClick={() => setRefundOpen(true)}>退款</Button></Tooltip>}
        {isOwner && (s === 'MAKING' || s === 'READY') && (
          <Tooltip title={blockedTip}><Button danger disabled={!!activeRefund} onClick={() => { setReason(''); setReasonModal('cancel') }}>整单取消</Button></Tooltip>
        )}
      </Space>
    )
  }

  return (
    <Drawer
      title={
        order ? (
          <Space wrap size={4}>
            {isMobile ? `桌 ${order.tableCode ?? '-'}` : `订单 ${order.orderNo}`}
            <OrderStatusTag status={order.status} cookingStartedAt={order.cookingStartedAt} />
            <OrderRefundTag status={order.refundStatus} />
          </Space>
        ) : '订单详情'
      }
      width={isMobile ? '100%' : 760}
      open={open}
      onClose={onClose}
      destroyOnHidden
      // 手机上标题栏放不下操作按钮，移到底部固定区
      extra={isMobile ? undefined : actions()}
      footer={isMobile && order && !readOnly ? <div style={{ overflowX: 'auto' }}>{actions()}</div> : undefined}
    >
      {!order ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin spinning={loading} /></div>
      ) : (
        <>
          {isUnsettled(order) && (
            <Alert
              style={{ marginBottom: 16 }}
              showIcon
              type="warning"
              message={`先吃后付 · 未结账 ${formatYuan(order.payAmount)}`}
              description={isKitchen ? '前厅会在顾客离店时结账。' : '顾客离店时点右上角「结账」登记收款；结账后才计入营收。'}
            />
          )}
          {order.cancelRequest && (
            <Alert
              style={{ marginBottom: 16 }}
              showIcon
              type={order.cancelRequest.status === 'APPLYING' ? 'error' : order.cancelRequest.status === 'APPROVED' ? 'info' : 'warning'}
              message={order.cancelRequest.status === 'APPLYING'
                ? '顾客申请取消订单，请确认'
                : order.cancelRequest.status === 'APPROVED' ? '已同意顾客的取消申请' : '已拒绝顾客的取消申请'}
              description={
                <Space direction="vertical" size={0}>
                  <span>原因：{order.cancelRequest.reason || '顾客未填写'} · 申请于 {fmt(order.cancelRequest.requestedAt)}</span>
                  {order.cancelRequest.rejectReason && <span>拒绝理由：{order.cancelRequest.rejectReason}</span>}
                  {order.cancelRequest.status === 'APPLYING' && (
                    <span>{isKitchen ? '等待前厅处理，处理前请勿开始制作。' : '处理前后厨无法开始制作这张单；同意后全额退回顾客余额。'}</span>
                  )}
                </Space>
              }
            />
          )}
          <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} bordered>
            <Descriptions.Item label="桌号"><Typography.Text strong style={{ fontSize: 16 }}>{order.tableCode ?? '-'}</Typography.Text></Descriptions.Item>
            <Descriptions.Item label="人数">{order.peopleCount} 人</Descriptions.Item>
            <Descriptions.Item label="支付方式">
              {isUnsettled(order)
                ? '先吃后付 · 未结账'
                : order.payment?.channel === 'OFFLINE' && order.payment.payMethod
                  ? `线下收款 · ${PAY_METHOD[order.payment.payMethod]}${order.payMode === 'PAY_LATER' ? '（离店结账）' : ''}`
                  : PLATFORM[order.platform]}
              {order.source === 'MERCHANT' && <Tag color="purple" style={{ marginInlineStart: 6 }}>前厅代客</Tag>}
            </Descriptions.Item>
            {order.payment?.remark && <Descriptions.Item label="收款备注">{order.payment.remark}</Descriptions.Item>}
            <Descriptions.Item label="下单时间">{fmt(order.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="支付时间">{fmt(order.paidAt)}</Descriptions.Item>
            <Descriptions.Item label="接单时间">{fmt(order.acceptedAt)}</Descriptions.Item>
            {order.cookingStartedAt !== undefined && <Descriptions.Item label="开始制作">{fmt(order.cookingStartedAt ?? null)}</Descriptions.Item>}
            <Descriptions.Item label="备注" span={isMobile ? 1 : 3}>{order.remark || <Typography.Text type="secondary">无</Typography.Text>}</Descriptions.Item>
            {order.cancelReason && <Descriptions.Item label="取消原因" span={isMobile ? 1 : 3}><Typography.Text type="danger">{order.cancelReason}</Typography.Text></Descriptions.Item>}
          </Descriptions>

          <Divider orientation="left" plain>菜品明细</Divider>
          <Table<OrderItemView> rowKey="id" size="small" pagination={false} columns={itemColumns} dataSource={order.items}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3} align="right">
                  <Space size="large">
                    <span>实付 <MoneyText fen={order.payAmount} strong /></span>
                    {order.refundedAmount > 0 && <span>已退 <MoneyText fen={order.refundedAmount} type="danger" /></span>}
                    <span>可退 <MoneyText fen={order.refundableAmount} /></span>
                  </Space>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right"><MoneyText fen={order.totalAmount} strong /></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />

          <Divider orientation="left" plain>支付信息</Divider>
          {order.payment ? (
            <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="商户单号"><Typography.Text copyable style={{ fontSize: 12 }}>{order.payment.outTradeNo}</Typography.Text></Descriptions.Item>
              <Descriptions.Item label="交易号"><Typography.Text copyable={!!order.payment.transactionNo} style={{ fontSize: 12 }}>{order.payment.transactionNo ?? '-'}</Typography.Text></Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={order.payment.status === 'SUCCESS' ? 'green' : order.payment.status === 'PENDING' ? 'orange' : 'default'}>
                  {order.payment.status === 'SUCCESS' ? '支付成功' : order.payment.status === 'PENDING' ? '待支付' : '已关闭'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="支付金额"><MoneyText fen={order.payment.amount} /></Descriptions.Item>
            </Descriptions>
          ) : (
            <Typography.Text type="secondary">尚未发起支付</Typography.Text>
          )}

          <Divider orientation="left" plain>退款记录（{order.refunds.length}）</Divider>
          {order.refunds.length === 0 ? (
            <Typography.Text type="secondary">无</Typography.Text>
          ) : (
            <Table<RefundView> rowKey="id" size="small" pagination={false} columns={refundColumns} dataSource={order.refunds} />
          )}

          <Divider orientation="left" plain>状态日志</Divider>
          <Timeline
            items={timelineLogs(order).map((l) => ({
              color: l.toStatus === 'CANCELLED' || l.toStatus === 'CLOSED' ? 'red' : l.toStatus === 'DONE' ? 'green' : 'blue',
              children: (
                <Space direction="vertical" size={0}>
                  <span>
                    <Typography.Text strong>{l.label}</Typography.Text>
                    <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      {l.operatorType ? `${OPERATOR_TYPE[l.operatorType]}${l.operatorName ? ` · ${l.operatorName}` : ''} · ` : ''}{fmt(l.createdAt)}
                    </Typography.Text>
                  </span>
                  {l.remark && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{l.remark}</Typography.Text>}
                </Space>
              ),
            }))}
          />
        </>
      )}

      <SettleModal order={order} open={settleOpen} onClose={() => setSettleOpen(false)} onDone={() => { setSettleOpen(false); void load(); onChanged?.() }} />
      <RefundModal order={order} open={refundOpen} onClose={() => setRefundOpen(false)} onDone={() => { setRefundOpen(false); void load(); onChanged?.() }} />

      <Modal
        title={reasonModal === 'reject' ? '拒单并全额退款' : reasonModal === 'rejectCancel' ? '拒绝顾客的取消申请' : '整单取消并全额退款'}
        open={reasonModal !== null}
        onCancel={() => setReasonModal(null)}
        onOk={submitReason}
        okText="确认"
        okButtonProps={{ danger: reasonModal !== 'rejectCancel' }}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          {reasonModal === 'reject' ? '订单将变为已取消，实付金额退回顾客会员余额，已扣减的限量库存回补。'
            : reasonModal === 'rejectCancel' ? '订单继续制作，顾客会在订单页看到拒绝理由，且不能再次申请取消。'
              : order && isUnsettled(order) ? '先吃后付、还没结账：订单直接取消，不需要退款。'
                : order?.payment?.channel === 'OFFLINE' ? '订单将停止制作并变为已取消，已收的款项记为线下退款，请当面退还顾客。'
                  : '订单将停止制作并变为已取消，实付金额退回顾客会员余额。'}
        </Typography.Paragraph>
        <Input.TextArea rows={3} maxLength={200} showCount value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={reasonModal === 'reject' ? '原因（可选），如：忙不过来 / 菜品做不了' : reasonModal === 'rejectCancel' ? '拒绝理由（必填），如：菜已备好，马上上桌' : '原因（必填）'} />
      </Modal>
    </Drawer>
  )
}
