import { useCallback, useEffect, useRef, useState } from 'react'
import { App, Button, Descriptions, Divider, Drawer, Input, Modal, Space, Spin, Table, Tag, Timeline, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { acceptOrder, cancelOrder, deliverOrder, getOrder, readyOrder, rejectOrder } from '../../api/order'
import type { OrderDetail, OrderItemView, RefundView } from '../../api/types'
import { formatYuan } from '../../utils/money'
import { isRefundUnresolved, OPERATOR_TYPE, ORDER_STATUS, PLATFORM, REFUND_INITIATOR, REFUND_TYPE } from '../../utils/orderStatus'
import { useIsOwner } from '../../utils/auth'
import MoneyText from '../../components/MoneyText'
import { OrderRefundTag, OrderStatusTag, RefundStatusTag } from '../../components/StatusTag'
import RefundModal from './RefundModal'
import { ignoreShownError } from '../../utils/errors'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Props {
  orderNo: string | null
  open: boolean
  onClose: () => void
  /** 订单发生变化后通知列表刷新 */
  onChanged?: () => void
}

const fmt = (v: string | null | undefined) => (v ? dayjs(v).format('MM-DD HH:mm:ss') : '-')

/** 订单详情抽屉：明细、支付、退款、状态日志 + 履约操作（接单 / 拒单 / 出餐 / 送达 / 取消 / 退款） */
export default function OrderDetailDrawer({ orderNo, open, onClose, onChanged }: Props) {
  const { message } = App.useApp()
  const isOwner = useIsOwner()
  const isMobile = useIsMobile()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [reasonModal, setReasonModal] = useState<'reject' | 'cancel' | null>(null)
  const [reason, setReason] = useState('')
  // 调用方传的是内联箭头函数，父页面每 5 秒轮询重渲染都会换一个新引用；
  // 若把 onClose 放进 load 的依赖，抽屉就会每 5 秒清空重拉。用 ref 持有最新回调。
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const load = useCallback(async () => {
    if (!orderNo) {
      return
    }
    setLoading(true)
    try {
      setOrder(await getOrder(orderNo))
    } catch (e) {
      // 打开详情失败（订单不存在 / 无权限）：请求层已提示，关闭抽屉回到列表
      onCloseRef.current()
      ignoreShownError(e)
    } finally {
      setLoading(false)
    }
  }, [orderNo])

  useEffect(() => {
    if (open) {
      setOrder(null)
      void load()
    }
  }, [open, load])

  const runOrderAction = async (fn: () => Promise<OrderDetail>, ok: string) => {
    setActing(true)
    try {
      setOrder(await fn())
      message.success(ok)
      onChanged?.()
    } catch (e) {
      // 操作失败（通常是状态已被别人改变）：请求层已提示，重新拉取详情让按钮与最新状态一致
      void load()
      ignoreShownError(e)
    } finally {
      setActing(false)
    }
  }

  const submitReason = async () => {
    if (!order || !reasonModal) {
      return
    }
    if (reasonModal === 'cancel' && !reason.trim()) {
      message.warning('请填写取消原因')
      return
    }
    const kind = reasonModal
    setReasonModal(null)
    await runOrderAction(() => (kind === 'reject' ? rejectOrder(order.orderNo, reason.trim()) : cancelOrder(order.orderNo, reason.trim())),
      kind === 'reject' ? '已拒单，退款处理中' : '已取消，退款处理中')
    setReason('')
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
    if (!order) {
      return null
    }
    const s = order.status
    // 后端同一订单同一时刻只允许一笔未了结的退款，再发起会被拒
    const activeRefund = order.refunds.find((r) => isRefundUnresolved(r.status))
    const blockedTip = activeRefund ? `已有一笔退款${activeRefund.status === 'APPLYING' ? '待审核' : activeRefund.status === 'PROCESSING' ? '处理中' : '失败待处理'}，请先处理` : undefined
    // 需求 §4：商家主动退款仅店主
    const canRefund = isOwner && (s === 'MAKING' || s === 'READY' || s === 'DONE') && order.refundableAmount > 0
    return (
      <Space wrap>
        {s === 'PAID' && (
          <>
            <Button type="primary" loading={acting} onClick={() => runOrderAction(() => acceptOrder(order.orderNo), '已接单')}>接单</Button>
            <Button danger loading={acting} onClick={() => { setReason(''); setReasonModal('reject') }}>拒单并退款</Button>
          </>
        )}
        {s === 'MAKING' && (
          <Button type="primary" loading={acting} onClick={() => runOrderAction(() => readyOrder(order.orderNo), '已出餐')}>出餐完成</Button>
        )}
        {s === 'READY' && (
          <Button type="primary" loading={acting} onClick={() => runOrderAction(() => deliverOrder(order.orderNo), '已送达')}>送达完成</Button>
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
            <OrderStatusTag status={order.status} />
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
      footer={isMobile && order ? <div style={{ overflowX: 'auto' }}>{actions()}</div> : undefined}
    >
      {!order ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin spinning={loading} /></div>
      ) : (
        <>
          <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} bordered>
            <Descriptions.Item label="桌号"><Typography.Text strong style={{ fontSize: 16 }}>{order.tableCode ?? '-'}</Typography.Text></Descriptions.Item>
            <Descriptions.Item label="人数">{order.peopleCount} 人</Descriptions.Item>
            <Descriptions.Item label="渠道">{PLATFORM[order.platform]}</Descriptions.Item>
            <Descriptions.Item label="下单时间">{fmt(order.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="支付时间">{fmt(order.paidAt)}</Descriptions.Item>
            <Descriptions.Item label="接单时间">{fmt(order.acceptedAt)}</Descriptions.Item>
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
              <Descriptions.Item label="渠道交易号"><Typography.Text copyable={!!order.payment.transactionNo} style={{ fontSize: 12 }}>{order.payment.transactionNo ?? '-'}</Typography.Text></Descriptions.Item>
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
            items={order.logs.map((l) => ({
              color: l.toStatus === 'CANCELLED' || l.toStatus === 'CLOSED' ? 'red' : l.toStatus === 'DONE' ? 'green' : 'blue',
              children: (
                <Space direction="vertical" size={0}>
                  <span>
                    <Typography.Text strong>{ORDER_STATUS[l.toStatus]?.label ?? l.toStatus}</Typography.Text>
                    <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      {OPERATOR_TYPE[l.operatorType]}{l.operatorName ? ` · ${l.operatorName}` : ''} · {fmt(l.createdAt)}
                    </Typography.Text>
                  </span>
                  {l.remark && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{l.remark}</Typography.Text>}
                </Space>
              ),
            }))}
          />
        </>
      )}

      <RefundModal order={order} open={refundOpen} onClose={() => setRefundOpen(false)} onDone={() => { setRefundOpen(false); void load(); onChanged?.() }} />

      <Modal
        title={reasonModal === 'reject' ? '拒单并全额退款' : '整单取消并全额退款'}
        open={reasonModal !== null}
        onCancel={() => setReasonModal(null)}
        onOk={submitReason}
        okText="确认"
        okButtonProps={{ danger: true }}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          {reasonModal === 'reject' ? '订单将变为已取消，实付金额原路退回顾客，已扣减的限量库存回补。' : '订单将停止制作并变为已取消，实付金额原路退回顾客。'}
        </Typography.Paragraph>
        <Input.TextArea rows={3} maxLength={200} showCount value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={reasonModal === 'reject' ? '原因（可选），如：忙不过来 / 菜品做不了' : '原因（必填）'} />
      </Modal>
    </Drawer>
  )
}
