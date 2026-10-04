import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, Card, Col, Descriptions, Row, Skeleton, Space, Statistic, Switch, Tag, Typography, theme as antdTheme } from 'antd'
import { ArrowRightOutlined, SoundOutlined } from '@ant-design/icons'
import { fetchStore } from '../../api/store'
import { fetchDashboard } from '../../api/report'
import type { DashboardToday, StoreDetail } from '../../api/types'
import { fenToYuan } from '../../utils/money'
import { useIsOwner } from '../../utils/auth'
import { playNewOrderSound, usePollStore } from '../../hooks/useOrderPoll'

/** 工作台：今日概览 + 待处理提醒 + 门店信息 */
export default function DashboardPage() {
  const navigate = useNavigate()
  const isOwner = useIsOwner()
  const { token } = antdTheme.useToken()
  const [store, setStore] = useState<StoreDetail | null>(null)
  const [stats, setStats] = useState<DashboardToday | null>(null)
  const { counts, soundEnabled, setSoundEnabled } = usePollStore()

  const [statsError, setStatsError] = useState(false)

  const load = useCallback(() => {
    fetchStore().then(setStore).catch(() => setStore(null))
    fetchDashboard()
      .then((s) => {
        setStats(s)
        setStatsError(false)
      })
      .catch(() => setStatsError(true))  // 保留上次数据；首次失败时显示重试，不要一直骨架屏
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 轮询计数变化时刷新概览（新订单 / 退款）
  useEffect(() => {
    if (counts) {
      fetchDashboard().then(setStats).catch(() => {})
    }
  }, [counts?.pendingAcceptCount, counts?.applyingRefundCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const pendingAccept = counts?.pendingAcceptCount ?? stats?.pendingAcceptCount ?? 0
  const making = counts?.makingCount ?? stats?.makingCount ?? 0
  const applying = counts?.applyingRefundCount ?? stats?.applyingRefundCount ?? 0
  const failed = counts?.failedRefundCount ?? stats?.failedRefundCount ?? 0

  return (
    <Row gutter={[16, 16]}>
      {(pendingAccept > 0 || applying > 0 || failed > 0) && (
        <Col span={24}>
          <Alert
            type={pendingAccept > 0 ? 'warning' : 'info'}
            showIcon
            message={
              <Space size="large" wrap>
                {pendingAccept > 0 && <span>有 <b>{pendingAccept}</b> 单待接单 <Button type="link" size="small" onClick={() => navigate('/orders?status=PAID')}>去处理 <ArrowRightOutlined /></Button></span>}
                {applying > 0 && isOwner && <span>有 <b>{applying}</b> 笔退款待审核 <Button type="link" size="small" onClick={() => navigate('/refunds?status=APPLYING')}>去审核 <ArrowRightOutlined /></Button></span>}
                {failed > 0 && isOwner && <span><b>{failed}</b> 笔退款失败需处理 <Button type="link" size="small" onClick={() => navigate('/refunds?status=FAILED')}>查看 <ArrowRightOutlined /></Button></span>}
              </Space>
            }
          />
        </Col>
      )}
      {statsError && !stats && (
        <Col span={24}>
          <Alert type="error" showIcon message="今日概览加载失败" action={<Button size="small" onClick={load}>重试</Button>} />
        </Col>
      )}
      <Col xs={12} lg={6}><Card loading={!stats && !statsError}><Statistic title="今日实收" value={fenToYuan(stats?.netIncome)} precision={2} prefix="¥" /></Card></Col>
      <Col xs={12} lg={6}><Card loading={!stats && !statsError}><Statistic title="今日订单" value={stats?.orderCount ?? 0} suffix="单" /></Card></Col>
      <Col xs={12} lg={6}>
        <Card hoverable onClick={() => navigate('/orders?status=PAID')}>
          <Statistic title="待接单" value={pendingAccept} valueStyle={{ color: pendingAccept > 0 ? token.colorWarning : undefined }} suffix={<Typography.Text type="secondary" style={{ fontSize: 14 }}>/ 制作中 {making}</Typography.Text>} />
        </Card>
      </Col>
      <Col xs={12} lg={6}>
        <Card hoverable={isOwner} onClick={() => isOwner && navigate('/refunds?status=APPLYING')}>
          <Statistic title="待处理退款" value={applying + failed} valueStyle={{ color: applying + failed > 0 ? token.colorError : undefined }} suffix={<Typography.Text type="secondary" style={{ fontSize: 14 }}>/ 今日退款 ¥{fenToYuan(stats?.refundedAmount).toFixed(2)}</Typography.Text>} />
        </Card>
      </Col>
      <Col xs={24} lg={16}>
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
          ) : (
            <Skeleton active paragraph={{ rows: 2 }} />
          )}
        </Card>
      </Col>
      <Col xs={24} lg={8}>
        <Card title="新订单提醒">
          <Space direction="vertical" size={12}>
            <Space>
              <SoundOutlined />
              <Switch checked={soundEnabled} onChange={setSoundEnabled} checkedChildren="提示音开" unCheckedChildren="提示音关" />
              <Button size="small" onClick={playNewOrderSound}>试听</Button>
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              每 5 秒检查一次新支付的订单并播放提示音。浏览器要求页面有过点击才允许播放声音，登录后请点一下「试听」。
            </Typography.Text>
            <Badge status={counts ? 'processing' : 'default'} text={counts ? '提醒服务运行中' : '正在连接…'} />
          </Space>
        </Card>
      </Col>
    </Row>
  )
}
