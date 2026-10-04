import { useCallback, useEffect, useState } from 'react'
import { Alert, App, Button, Card, Col, DatePicker, Result, Row, Space, Statistic, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { exportReport, fetchDashboard, fetchReportSummary } from '../../api/report'
import type { DashboardToday, ReportSummary } from '../../api/types'
import { fenToYuan, formatYuan } from '../../utils/money'
import DailyBarChart from '../../components/DailyBarChart'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import { ignoreShownError } from '../../utils/errors'

/** 区间统计与导出共用的最大天数（与后端一致） */
const MAX_RANGE_DAYS = 92

/** 快捷区间：每次渲染时按当前日期计算（页面开过午夜后「今天」仍然正确） */
function rangePresets(): { label: string; value: [Dayjs, Dayjs] }[] {
  const today = dayjs()
  return [
    { label: '今天', value: [today, today] },
    { label: '昨天', value: [today.subtract(1, 'day'), today.subtract(1, 'day')] },
    { label: '近 7 天', value: [today.subtract(6, 'day'), today] },
    { label: '近 30 天', value: [today.subtract(29, 'day'), today] },
    { label: '本周', value: [today.startOf('week'), today] },
    { label: '本月', value: [today.startOf('month'), today] },
    { label: '上月', value: [today.subtract(1, 'month').startOf('month'), today.subtract(1, 'month').endOf('month')] },
  ]
}

/** 数据看板（今日概览 + 任意区间统计）+ 流水导出（店主）。区间选择同时作用于统计与导出 */
export default function ReportsPage() {
  const isMobile = useIsMobile()
  const { message } = App.useApp()
  const [data, setData] = useState<DashboardToday | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()])
  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState(false)
  const [exporting, setExporting] = useState(false)
  // 快速切换区间时只采纳最后一次请求的结果
  const beginSummary = useLatestRequest()

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setData(await fetchDashboard())
    } catch (e) {
      // 首次加载：页面展示错误状态与重试入口（请求层也会提示一次）
      setError(true)
      ignoreShownError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSummary = useCallback(async () => {
    const isLatest = beginSummary()
    setSummaryLoading(true)
    setSummaryError(false)
    try {
      const s = await fetchReportSummary(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'))
      if (isLatest()) setSummary(s)
    } catch (e) {
      if (isLatest()) setSummaryError(true)
      ignoreShownError(e)  // 请求层已提示；卡片内提供重试
    } finally {
      if (isLatest()) setSummaryLoading(false)
    }
  }, [range, beginSummary])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const doExport = async () => {
    setExporting(true)
    try {
      await exportReport(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'))
      message.success('已开始下载')
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    } finally {
      setExporting(false)
    }
  }

  if (error) {
    return <Result status="error" title="看板加载失败" extra={<Button type="primary" onClick={load}>重试</Button>} />
  }

  const dishColumns: ColumnsType<DashboardToday['topDishes'][number]> = [
    { title: '#', width: 48, render: (_, __, i) => i + 1 },
    { title: '菜品', dataIndex: 'dishName' },
    { title: '销量', dataIndex: 'quantity', width: 80, align: 'right' },
    { title: '金额', dataIndex: 'amount', width: 110, align: 'right', render: (v: number) => formatYuan(v) },
  ]
  const dailyColumns: ColumnsType<DashboardToday['daily'][number]> = [
    { title: '日期', dataIndex: 'date', width: 110 },
    { title: '订单数', dataIndex: 'orderCount', width: 90, align: 'right' },
    { title: '实收', dataIndex: 'netIncome', width: 120, align: 'right', render: (v: number) => formatYuan(v) },
  ]

  const rangeText = `${range[0].format('MM-DD')} ~ ${range[1].format('MM-DD')}`
  const rangeDays = range[1].diff(range[0], 'day') + 1

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>数据看板</Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={() => { void load(); void loadSummary() }} loading={loading || summaryLoading}>刷新</Button>
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}><Card loading={!data}><Statistic title="今日实收（支付 − 退款）" value={fenToYuan(data?.netIncome)} precision={2} prefix="¥" /></Card></Col>
        <Col xs={12} lg={6}><Card loading={!data}><Statistic title="今日订单" value={data?.orderCount ?? 0} suffix="单" /></Card></Col>
        <Col xs={12} lg={6}><Card loading={!data}><Statistic title="今日支付金额" value={fenToYuan(data?.paidAmount)} precision={2} prefix="¥" /></Card></Col>
        <Col xs={12} lg={6}><Card loading={!data}><Statistic title="今日退款" value={fenToYuan(data?.refundedAmount)} precision={2} prefix="¥" suffix={<Typography.Text type="secondary" style={{ fontSize: 14 }}>/ {data?.refundCount ?? 0} 笔</Typography.Text>} /></Card></Col>
        <Col xs={12} lg={6}><Card loading={!data}><Statistic title="今日会员充值（预收款）" value={fenToYuan(data?.rechargeAmount)} precision={2} prefix="¥" /></Card></Col>
      </Row>

      <Card
        title="区间统计"
        extra={
          <Space wrap>
            <DatePicker.RangePicker
              value={range}
              allowClear={false}
              size="small"
              onChange={(v) => {
                if (!v || !v[0] || !v[1]) return
                if (v[1].diff(v[0], 'day') >= MAX_RANGE_DAYS) {
                  message.warning(`单次最多统计 ${MAX_RANGE_DAYS} 天，请缩小范围`)
                  return
                }
                setRange([v[0], v[1]])
              }}
              disabledDate={(d) => d.isAfter(dayjs(), 'day')}
              presets={rangePresets()}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>按支付成功日期统计，最多 {MAX_RANGE_DAYS} 天</Typography.Text>
          </Space>
        }
      >
        {summaryError && !summary ? (
          <Alert type="error" showIcon message="区间统计加载失败" action={<Button size="small" onClick={() => void loadSummary()}>重试</Button>} />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Row gutter={[16, 16]}>
              <Col xs={12} lg={6}><Statistic title={`实收（${rangeDays} 天）`} value={fenToYuan(summary?.netIncome)} precision={2} prefix="¥" loading={!summary} /></Col>
              <Col xs={12} lg={6}><Statistic title="订单数" value={summary?.orderCount ?? 0} suffix="单" loading={!summary} /></Col>
              <Col xs={12} lg={6}><Statistic title="日均实收" value={fenToYuan(summary ? Math.round(summary.netIncome / Math.max(1, summary.daily.length)) : 0)} precision={2} prefix="¥" loading={!summary} /></Col>
              <Col xs={12} lg={6}><Statistic title="退款" value={fenToYuan(summary?.refundedAmount)} precision={2} prefix="¥" suffix={<Typography.Text type="secondary" style={{ fontSize: 14 }}>/ {summary?.refundCount ?? 0} 笔</Typography.Text>} loading={!summary} /></Col>
              <Col xs={12} lg={6}><Statistic title="会员充值（预收款，不计入实收）" value={fenToYuan(summary?.rechargeAmount)} precision={2} prefix="¥" loading={!summary} /></Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={14}>
                <Card type="inner" title={`每日实收 ${rangeText}`} loading={!summary && summaryLoading}>
                  {summary && <DailyBarChart data={summary.daily} width={isMobile ? 360 : 640} label={`${rangeText} 每日实收`} />}
                  {summary && (
                    <Table
                      size="small"
                      rowKey="date"
                      pagination={summary.daily.length > 14 ? { pageSize: 14, size: 'small', showSizeChanger: false } : false}
                      columns={dailyColumns}
                      dataSource={summary.daily}
                      style={{ marginTop: 12 }}
                    />
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={10}>
                <Card type="inner" title={`菜品销售排行 ${rangeText}`} loading={!summary && summaryLoading}>
                  <Table size="small" rowKey="dishName" pagination={false} columns={dishColumns} dataSource={summary?.topDishes ?? []} locale={{ emptyText: '该区间暂无销售' }} />
                </Card>
              </Col>
            </Row>
          </Space>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card title="今日菜品销售排行" loading={!data}>
            <Table size="small" rowKey="dishName" pagination={false} columns={dishColumns} dataSource={data?.topDishes ?? []} locale={{ emptyText: '今日暂无销售' }} />
          </Card>
        </Col>
      </Row>

      <Card title="流水导出" extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>CSV：订单 + 支付 + 退款明细，可直接用 Excel 打开，用于人工对账</Typography.Text>}>
        <Space wrap>
          <Typography.Text>导出 {range[0].format('YYYY-MM-DD')} ~ {range[1].format('YYYY-MM-DD')}（与上方区间一致）</Typography.Text>
          <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={doExport}>导出 CSV</Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>按下单日期筛选，单次最多 {MAX_RANGE_DAYS} 天</Typography.Text>
        </Space>
      </Card>
    </Space>
  )
}
