import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, Descriptions, Row, Skeleton, Space, Statistic, Tag, Typography, theme as antdTheme } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { fetchStore } from '../../api/store'
import { fetchDashboard } from '../../api/report'
import type { DashboardToday, StoreDetail } from '../../api/types'
import { fenToYuan } from '../../utils/money'
import { useIsOwner } from '../../utils/auth'
import { usePollStore } from '../../hooks/useOrderPoll'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import { useVisiblePolling } from '../../hooks/useVisiblePolling'
import { ignoreShownError } from '../../utils/errors'
import SyncStatus from '../../components/SyncStatus'

/** 工作台：今日概览 + 待处理提醒 + 门店信息 */
export default function DashboardPage() {
  const navigate = useNavigate()
  const isOwner = useIsOwner()
  const { token } = antdTheme.useToken()
  const [store, setStore] = useState<StoreDetail | null>(null)
  const [stats, setStats] = useState<DashboardToday | null>(null)
  const counts = usePollStore((s) => s.counts)

  const [statsError, setStatsError] = useState(false)
  const [storeError, setStoreError] = useState(false)
  const beginLoad = useLatestRequest()

  const load = useCallback(async (quiet = false) => {
    const isLatest = beginLoad()
    // 分别保留成功的门店信息与营收，单个接口失败不清掉另一块已显示的数据。
    const [storeResult, statsResult] = await Promise.allSettled([
      fetchStore({ silent: quiet }),
      isOwner ? fetchDashboard({ silent: quiet }) : Promise.resolve(null),
    ])
    if (!isLatest()) return
    if (storeResult.status === 'fulfilled') {
      setStore(storeResult.value)
      setStoreError(false)
    } else {
      setStoreError(true)
      ignoreShownError(storeResult.reason)
    }
    // 营收数据仅店主可见（店员只看待接单 / 制作中，来自全局轮询）。
    if (statsResult.status === 'fulfilled') {
      if (statsResult.value) setStats(statsResult.value)
      setStatsError(false)
    } else {
      setStatsError(true)
      ignoreShownError(statsResult.reason)
    }
  }, [isOwner, beginLoad])

  useEffect(() => {
    void load()
  }, [load])

  // 收款、退款金额与营业状态可能变化而待处理计数不变，直接同步当前数据。
  useVisiblePolling(() => load(true))

  const pendingAccept = counts?.pendingAcceptCount ?? stats?.pendingAcceptCount ?? 0
  const making = counts?.makingCount ?? stats?.makingCount ?? 0
  const applying = counts?.applyingRefundCount ?? stats?.applyingRefundCount ?? 0
  const failed = counts?.failedRefundCount ?? stats?.failedRefundCount ?? 0
  const overdue = counts?.overdueRefundCount ?? 0
  const cancelRequests = counts?.cancelRequestCount ?? 0
  const unsettled = counts?.unsettledCount ?? 0

  return (
    <Row gutter={[16, 16]}>
      {((storeError && store) || (statsError && stats)) && (
        <Col span={24}><SyncStatus failed /></Col>
      )}
      {(pendingAccept > 0 || cancelRequests > 0 || unsettled > 0 || applying > 0 || failed > 0) && (
        <Col span={24}>
          <Alert
            type={pendingAccept > 0 || cancelRequests > 0 || overdue > 0 ? 'warning' : 'info'}
            showIcon
            message={
              <Space size="large" wrap>
                {pendingAccept > 0 && <span>有 <b>{pendingAccept}</b> 单待接单 <Button type="link" size="small" onClick={() => navigate('/orders?status=PAID')}>去处理 <ArrowRightOutlined /></Button></span>}
                {unsettled > 0 && <span><b>{unsettled}</b> 单先吃后付未结账 <Button type="link" size="small" onClick={() => navigate('/orders?status=UNSETTLED')}>去结账 <ArrowRightOutlined /></Button></span>}
                {cancelRequests > 0 && <span><b>{cancelRequests}</b> 位顾客申请取消订单 <Button type="link" size="small" onClick={() => navigate('/orders?status=CANCEL_REQUEST')}>去处理 <ArrowRightOutlined /></Button></span>}
                {applying > 0 && isOwner && (
                  <span>
                    有 <b>{applying}</b> 笔退款待审核{overdue > 0 && <>，其中 <b>{overdue}</b> 笔已超过 2 小时</>}
                    <Button type="link" size="small" onClick={() => navigate('/refunds?status=APPLYING')}>去审核 <ArrowRightOutlined /></Button>
                  </span>
                )}
                {failed > 0 && isOwner && <span><b>{failed}</b> 笔退款失败需处理 <Button type="link" size="small" onClick={() => navigate('/refunds?status=FAILED')}>查看 <ArrowRightOutlined /></Button></span>}
              </Space>
            }
          />
        </Col>
      )}
      {statsError && !stats && (
        <Col span={24}>
          <Alert type="error" showIcon message="今日概览加载失败" action={<Button size="small" onClick={() => void load()}>重试</Button>} />
        </Col>
      )}
      {isOwner && <Col xs={12} lg={6}><Card loading={!stats && !statsError} style={{ height: '100%' }}><Statistic title="今日实收" value={fenToYuan(stats?.netIncome)} precision={2} prefix="¥" /></Card></Col>}
      {isOwner && <Col xs={12} lg={6}><Card loading={!stats && !statsError} style={{ height: '100%' }}><Statistic title="今日订单" value={stats?.orderCount ?? 0} suffix="单" /></Card></Col>}
      <Col xs={12} lg={6}>
        <Card hoverable style={{ height: '100%' }} onClick={() => navigate('/orders?status=PAID')}>
          <Statistic title="待接单" value={pendingAccept} valueStyle={{ color: pendingAccept > 0 ? token.colorWarning : undefined }} suffix={<Typography.Text type="secondary" style={{ fontSize: 14 }}>/ 待制作·制作中 {making}</Typography.Text>} />
        </Card>
      </Col>
      {isOwner && <Col xs={12} lg={6}>
        <Card hoverable style={{ height: '100%' }} onClick={() => navigate('/refunds?status=APPLYING')}>
          <Statistic title="待处理退款" value={applying + failed} valueStyle={{ color: applying + failed > 0 ? token.colorError : undefined }} suffix={<Typography.Text type="secondary" style={{ fontSize: 14 }}>/ 今日退款 ¥{fenToYuan(stats?.refundedAmount).toFixed(2)}</Typography.Text>} />
        </Card>
      </Col>}
      <Col span={24}>
        <Card title="门店信息" extra={isOwner && <Button type="link" size="small" onClick={() => navigate('/settings')}>店铺设置</Button>}>
          {store ? (
            <Descriptions column={{ xs: 1, md: 2, xl: 3 }}>
              <Descriptions.Item label="门店">{store.name}</Descriptions.Item>
              <Descriptions.Item label="营业状态">
                {store.businessStatus === 1 ? <Tag color="green">营业中</Tag> : <Tag>已打烊</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="营业时间">{store.businessHours ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="接单模式">{store.autoAccept ? '自动接单' : '手动接单'}</Descriptions.Item>
              <Descriptions.Item label="未支付关单">{store.payTimeoutMin} 分钟</Descriptions.Item>
              <Descriptions.Item label="未接单自动退款">{store.acceptTimeoutMin} 分钟</Descriptions.Item>
            </Descriptions>
          ) : storeError ? (
            <Alert type="error" showIcon message="门店信息加载失败" action={<Button size="small" onClick={() => void load()}>重试</Button>} />
          ) : (
            <Skeleton active paragraph={{ rows: 2 }} />
          )}
        </Card>
      </Col>
    </Row>
  )
}
