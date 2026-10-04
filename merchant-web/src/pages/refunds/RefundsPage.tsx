import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { App, Badge, Button, Card, Input, Modal, Popconfirm, Space, Table, Tabs, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { approveRefund, listRefunds, offlineRefund, rejectRefund, retryRefund } from '../../api/refund'
import type { RefundView } from '../../api/types'
import { REFUND_INITIATOR, REFUND_TYPE } from '../../utils/orderStatus'
import { usePollStore } from '../../hooks/useOrderPoll'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import MoneyText from '../../components/MoneyText'
import { RefundStatusTag } from '../../components/StatusTag'
import OrderDetailDrawer from '../orders/OrderDetailDrawer'

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
export default function RefundsPage() {
  const { message } = App.useApp()
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
    } catch {
      // 已统一提示
    } finally {
      if (isLatest()) setLoading(false)
    }
  }, [status, page, beginLoad])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (refundNo: string, fn: () => Promise<RefundView>, ok: string) => {
    setActing(refundNo)
    try {
      const r = await fn()
      if (r.status === 'FAILED') {
        message.warning(`${ok}，但渠道返回失败：${r.failReason ?? ''}`)
      } else if (ok === '已登记线下退款' && r.status === 'SUCCESS') {
        // 登记线下退款前后端会先向渠道确认：渠道其实已退成功时自动改为成功，避免重复退款
        message.info('渠道显示该笔已原路退款成功，已自动更新为退款成功，无需线下退款')
      } else {
        message.success(ok)
      }
    } catch {
      // 已统一提示
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
    setReasonModal(null)
    await run(refund.refundNo,
      () => (kind === 'reject' ? rejectRefund(refund.refundNo, reason.trim()) : offlineRefund(refund.refundNo, reason.trim())),
      kind === 'reject' ? '已拒绝' : '已登记线下退款')
    setReason('')
  }

  const columns: ColumnsType<RefundView> = [
    {
      title: '退款单',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Typography.Text style={{ fontSize: 12 }}>{r.refundNo}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{dayjs(r.createdAt).format('MM-DD HH:mm')} · {REFUND_INITIATOR[r.initiator]}{r.operatorName ? ` · ${r.operatorName}` : ''}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '订单',
      width: 200,
      render: (_, r) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => r.orderNo && setDetail(r.orderNo)}>
          <Space size={4}><Typography.Text strong>{r.tableCode ?? '-'}</Typography.Text><span style={{ fontSize: 12 }}>{r.orderNo}</span></Space>
        </Button>
      ),
    },
    { title: '金额', dataIndex: 'amount', width: 100, align: 'right', render: (v: number) => <MoneyText fen={v} strong type="danger" /> },
    {
      title: '类型 / 内容',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{REFUND_TYPE[r.type]}{r.items.length > 0 ? `：${r.items.map((i) => `${i.dishName}×${i.quantity}`).join('、')}` : ''}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.reason}</Typography.Text>
          {r.failReason && <Typography.Text type="danger" style={{ fontSize: 12 }}>{r.failReason}</Typography.Text>}
          {r.rejectReason && <Typography.Text type="secondary" style={{ fontSize: 12 }}>拒绝理由：{r.rejectReason}</Typography.Text>}
        </Space>
      ),
    },
    { title: '状态', dataIndex: 'status', width: 100, render: (v: RefundView['status'], r) => <Space direction="vertical" size={0}><RefundStatusTag status={v} />{r.successAt && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{dayjs(r.successAt).format('MM-DD HH:mm')}</Typography.Text>}</Space> },
    {
      title: '操作',
      width: 200,
      render: (_, r) => (
        <Space size={0} wrap>
          {r.status === 'APPLYING' && (
            <>
              <Popconfirm title={`同意退款 ¥${(r.amount / 100).toFixed(2)}？`} description="将立即向支付渠道发起原路退款" onConfirm={() => run(r.refundNo, () => approveRefund(r.refundNo), '已同意，退款处理中')}>
                <Button type="link" size="small" loading={acting === r.refundNo}>同意</Button>
              </Popconfirm>
              <Button type="link" size="small" danger onClick={() => { setReason(''); setReasonModal({ kind: 'reject', refund: r }) }}>拒绝</Button>
            </>
          )}
          {r.status === 'FAILED' && (
            <>
              <Button type="link" size="small" loading={acting === r.refundNo} onClick={() => run(r.refundNo, () => retryRefund(r.refundNo), '已重新发起')}>重试</Button>
              <Button type="link" size="small" onClick={() => { setReason(''); setReasonModal({ kind: 'offline', refund: r }) }}>登记线下退款</Button>
            </>
          )}
        </Space>
      ),
    },
  ]

  const tabLabel = (t: { key: string; label: string }) => {
    const n = t.key === 'APPLYING' ? counts?.applyingRefundCount : t.key === 'FAILED' ? counts?.failedRefundCount : 0
    return n ? <Badge count={n} size="small" offset={[8, -2]}>{t.label}</Badge> : t.label
  }

  return (
    <Card title="退款管理" extra={<Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>}>
      <Tabs
        activeKey={status}
        onChange={(k) => { setPage(1); const next = new URLSearchParams(params); next.set('status', k); setParams(next, { replace: true }) }}
        items={TABS.map((t) => ({ key: t.key, label: tabLabel(t) }))}
      />
      <Table<RefundView>
        scroll={{ x: 'max-content' }}
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={data.list}
        pagination={{ current: page, pageSize: PAGE_SIZE, total: data.total, onChange: setPage, showTotal: (t) => `共 ${t} 笔` }}
      />
      <OrderDetailDrawer orderNo={detail} open={!!detail} onClose={() => setDetail(null)} onChanged={() => void load()} />
      <Modal
        title={reasonModal?.kind === 'reject' ? '拒绝退款申请' : '登记线下退款'}
        open={!!reasonModal}
        onCancel={() => setReasonModal(null)}
        onOk={submitReason}
        okText="确认"
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
    </Card>
  )
}
