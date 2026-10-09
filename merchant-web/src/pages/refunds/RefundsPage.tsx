import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { App, Badge, Button, Card, Col, Empty, Input, Modal, Pagination, Row, Space, Spin, Tabs, Tag, Typography, theme as antdTheme } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { approveRefund, listRefunds, offlineRefund, rejectRefund, retryRefund } from '../../api/refund'
import type { RefundView } from '../../api/types'
import { REFUND_INITIATOR, REFUND_TYPE } from '../../utils/orderStatus'
import { usePollStore } from '../../hooks/useOrderPoll'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import MoneyText from '../../components/MoneyText'
import { formatYuan } from '../../utils/money'
import { RefundStatusTag } from '../../components/StatusTag'
import OrderDetailDrawer from '../orders/OrderDetailDrawer'
import { ignoreShownError } from '../../utils/errors'
import Panel from '../../components/Panel'

const PAGE_SIZE = 20
const TABS = [
  { key: 'APPLYING', label: '待审核' },
  { key: 'PROCESSING', label: '处理中' },
  { key: 'FAILED', label: '失败' },
  { key: 'SUCCESS,OFFLINE', label: '已退款' },
  { key: 'REJECTED,WITHDRAWN', label: '已关闭' },
  { key: '', label: '全部' },
]

/** 退款管理（店主）：审核 / 重试 / 登记线下退款 */
/** 已停用的微信 / 支付宝渠道的历史退款（后端失败原因固定以此开头），系统无法线上退款 */
const isLegacyChannelRefund = (r: RefundView) => r.status === 'FAILED' && (r.failReason ?? '').startsWith('该笔支付来自已停用的')

export default function RefundsPage() {
  const { message, modal } = App.useApp()
  const { token } = antdTheme.useToken()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'APPLYING'
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ list: RefundView[]; total: number }>({ list: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [reasonModal, setReasonModal] = useState<{ kind: 'reject' | 'offline'; refund: RefundView } | null>(null)
  const [reason, setReason] = useState('')
  const counts = usePollStore((s) => s.counts)

  const beginLoad = useLatestRequest()

  const load = useCallback(async () => {
    const isLatest = beginLoad()
    setLoading(true)
    try {
      const res = await listRefunds({ status: status || undefined, page, pageSize: PAGE_SIZE })
      if (isLatest()) setData({ list: res.list, total: res.total })
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    } finally {
      if (isLatest()) setLoading(false)
    }
  }, [status, page, beginLoad])

  useEffect(() => {
    void load()
  }, [load])

  // 轮询到的退款计数变化（新申请、退款失败）时刷新列表，角标和列表保持一致
  const refundCountKey = counts ? `${counts.applyingRefundCount}-${counts.failedRefundCount}` : ''
  useEffect(() => {
    if (refundCountKey) void load()
    // load 变化时上面的 effect 已经加载过，这里只跟随计数变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refundCountKey])

  // 处理完当前页最后一条后，回到上一页而不是停在空页
  useEffect(() => {
    if (!loading && page > 1 && data.list.length === 0 && data.total > 0) setPage((p) => p - 1)
  }, [loading, page, data])

  /** 执行退款操作；返回是否成功（失败时请求层已提示） */
  const runRefundAction = async (refundNo: string, fn: () => Promise<RefundView>, ok: string): Promise<boolean> => {
    setActing(refundNo)
    try {
      const r = await fn()
      if (r.status === 'FAILED') {
        message.warning(`${ok}，但退款失败：${r.failReason ?? ''}`)
      } else if (ok === '已重新发起' && r.status === 'SUCCESS') {
        message.info('该笔已退回会员余额，已自动更新为退款成功')
      } else if (ok === '已登记线下退款' && r.status === 'SUCCESS') {
        // 登记线下退款前后端会先查会员余额流水：其实已退回余额时自动改为成功，避免重复退款
        message.info('该笔已退回会员余额，已自动更新为退款成功，无需线下退款')
      } else {
        message.success(ok)
      }
      return true
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
      return false
    } finally {
      setActing(null)
      void load()
    }
  }

  const submitReason = async () => {
    if (!reasonModal) {
      return
    }
    if (!reason.trim()) {
      message.warning(reasonModal.kind === 'reject' ? '拒绝退款必须填写理由' : '请填写线下退款说明')
      return
    }
    const { kind, refund } = reasonModal
    if (acting === refund.refundNo) return  // 防止重复提交
    // 请求结束前保持弹窗打开：失败时用户填写的理由不会丢，可以直接重试
    const ok = await runRefundAction(refund.refundNo,
      () => (kind === 'reject' ? rejectRefund(refund.refundNo, reason.trim()) : offlineRefund(refund.refundNo, reason.trim())),
      kind === 'reject' ? '已拒绝' : '已登记线下退款')
    if (ok) {
      setReasonModal(null)
      setReason('')
    }
  }

  /** 待审核超过 2 小时（需求 §7.3 的再次提醒阈值），卡片红框提示 */
  const isOverdue = (r: RefundView) => r.status === 'APPLYING' && dayjs().diff(dayjs(r.createdAt), 'minute') >= 120

  const waited = (createdAt: string) => {
    const m = dayjs().diff(dayjs(createdAt), 'minute')
    if (m < 1) return '刚刚'
    if (m < 60) return `${m} 分钟前`
    const h = Math.floor(m / 60)
    return h < 24 ? `${h} 小时${m % 60 ? ` ${m % 60} 分` : ''}前` : dayjs(createdAt).format('MM-DD HH:mm')
  }

  const confirmApprove = (r: RefundView) => {
    modal.confirm({
      title: '同意退款',
      icon: null,
      content: (
        <Space direction="vertical" size={4} style={{ width: '100%', padding: '8px 0' }}>
          <Typography.Text type="secondary">退款金额</Typography.Text>
          <MoneyText fen={r.amount} strong size={28} />
          <Typography.Text type="secondary">将立即退回顾客的会员余额，不改变订单履约状态。</Typography.Text>
        </Space>
      ),
      okText: '确认同意',
      cancelText: '取消',
      onOk: () => runRefundAction(r.refundNo, () => approveRefund(r.refundNo), '已同意，退款处理中'),
    })
  }

  const actions = (r: RefundView) => {
    if (r.status === 'APPLYING') {
      return (
        <Space>
          <Button type="primary" loading={acting === r.refundNo} onClick={() => confirmApprove(r)}>同意</Button>
          <Button danger disabled={acting === r.refundNo} onClick={() => { setReason(''); setReasonModal({ kind: 'reject', refund: r }) }}>拒绝</Button>
        </Space>
      )
    }
    if (r.status === 'FAILED' || r.status === 'PROCESSING') {
      // 处理中也允许重试 / 线下登记：后端会先查余额流水确认该单确实没退成功，已退则自动改为成功。
      // 已停用的微信 / 支付宝渠道的历史支付单无法线上退款，重试必然失败，只提供线下登记
      return (
        <Space>
          {!isLegacyChannelRefund(r) && (
            <Button type="primary" loading={acting === r.refundNo} onClick={() => modal.confirm({
              title: `重新发起退款 ${formatYuan(r.amount)}？`,
              content: '将再次尝试把这笔钱退回顾客会员余额。系统会先核对是否已经退过，不会重复退款。',
              okText: '重新发起',
              onOk: () => runRefundAction(r.refundNo, () => retryRefund(r.refundNo), '已重新发起'),
            })}>重试</Button>
          )}
          <Button disabled={acting === r.refundNo} onClick={() => { setReason(''); setReasonModal({ kind: 'offline', refund: r }) }}>登记线下退款</Button>
        </Space>
      )
    }
    return null
  }

  const refundCard = (r: RefundView) => {
    const overdue = isOverdue(r)
    const content = `${REFUND_TYPE[r.type]}${r.items.length > 0 ? `：${r.items.map((i) => `${i.dishName}×${i.quantity}`).join('、')}` : ''}`
    return (
      <Card
        key={r.id}
        // 设计稿：卡片无描边；超过 2 小时未审核用红框提醒
        style={{ boxShadow: overdue ? `0 0 0 2px ${token.colorError}` : undefined }}
        styles={{ body: { padding: '20px 24px' } }}
      >
        {overdue && <Tag color="error" style={{ marginBottom: 12 }}>超过 2 小时未审核</Tag>}
        <Row gutter={[24, 12]} align="middle" wrap>
          <Col flex="1 1 320px" style={{ minWidth: 0 }}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Space size={8} wrap>
                <Typography.Text strong style={{ fontSize: 16 }}>{r.refundNo}</Typography.Text>
                <RefundStatusTag status={r.status} />
              </Space>
              <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => r.orderNo && setDetail(r.orderNo)}>
                订单 {r.orderNo ?? '-'} · {r.tableCode ?? '-'}
              </Button>
              <Typography.Text>{content}</Typography.Text>
              {r.reason && (
                <div style={{ background: token.colorFillAlter, borderRadius: 8, padding: '8px 12px' }}>
                  <Typography.Text type="secondary">{REFUND_INITIATOR[r.initiator]}：</Typography.Text>{r.reason}
                </div>
              )}
              {r.failReason && <Typography.Text type={r.status === 'FAILED' ? 'danger' : 'secondary'}>{r.failReason}</Typography.Text>}
              {r.rejectReason && <Typography.Text type="secondary">拒绝理由：{r.rejectReason}</Typography.Text>}
              <Typography.Text type={overdue ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
                申请于 {dayjs(r.createdAt).format('MM-DD HH:mm')}（{waited(r.createdAt)}）
                {r.operatorName ? ` · ${r.operatorName}` : ''}
                {r.successAt ? ` · 退款于 ${dayjs(r.successAt).format('MM-DD HH:mm')}` : ''}
              </Typography.Text>
            </Space>
          </Col>
          <Col flex="none" style={{ textAlign: 'right' }}>
            <Space direction="vertical" size={12} align="end">
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>退款金额</Typography.Text>
                <MoneyText fen={r.amount} strong type="danger" size={24} />
              </div>
              {actions(r)}
            </Space>
          </Col>
        </Row>
      </Card>
    )
  }

  const tabLabel = (t: { key: string; label: string }) => {
    const n = t.key === 'APPLYING' ? counts?.applyingRefundCount : t.key === 'FAILED' ? counts?.failedRefundCount : 0
    return n ? <Badge count={n} size="small" offset={[8, -2]}>{t.label}</Badge> : t.label
  }

  return (
    <div>
      <Tabs
        activeKey={status}
        tabBarStyle={{ marginBottom: 16 }}
        tabBarExtraContent={<Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>}
        onChange={(k) => { setPage(1); const next = new URLSearchParams(params); next.set('status', k); setParams(next, { replace: true }) }}
        items={TABS.map((t) => ({ key: t.key, label: tabLabel(t) }))}
      />
      <Spin spinning={loading}>
        {data.list.length === 0 ? (
          <Panel padding="48px 0"><Empty description={loading ? '加载中…' : '暂无退款记录'} /></Panel>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {data.list.map(refundCard)}
          </Space>
        )}
      </Spin>
      {data.total > PAGE_SIZE && (
        <Pagination style={{ marginTop: 16, textAlign: 'right' }} align="end" current={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} showTotal={(t) => `共 ${t} 笔`} showSizeChanger={false} />
      )}
      <OrderDetailDrawer orderNo={detail} open={!!detail} onClose={() => setDetail(null)} onChanged={() => void load()} />
      <Modal
        title={reasonModal?.kind === 'reject' ? '拒绝退款申请' : '登记线下退款'}
        open={!!reasonModal}
        onCancel={() => setReasonModal(null)}
        onOk={submitReason}
        okText="确认"
        confirmLoading={!!reasonModal && acting === reasonModal.refund.refundNo}
        okButtonProps={{ danger: reasonModal?.kind === 'reject' }}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          {reasonModal?.kind === 'reject'
            ? '顾客会在订单页看到拒绝理由，请如实填写。'
            : '确认已通过现金 / 转账等方式退还顾客后再登记；登记后计入该订单的已退金额，不可撤销。'}
        </Typography.Paragraph>
        <Input.TextArea rows={3} maxLength={255} showCount value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={reasonModal?.kind === 'reject' ? '拒绝理由（必填）' : '如：现金退还 ¥38.00，店员小王经手'} />
      </Modal>
    </div>
  )
}
