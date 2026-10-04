import { useCallback, useEffect, useState } from 'react'
import { App, Button, Card, Col, DatePicker, Result, Row, Space, Statistic, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { exportReport, fetchDashboard } from '../../api/report'
import type { DashboardToday } from '../../api/types'
import { fenToYuan, formatYuan } from '../../utils/money'
import DailyBarChart from '../../components/DailyBarChart'
import { useIsMobile } from '../../hooks/useIsMobile'

/** 数据看板 + 流水导出（店主） */
export default function ReportsPage() {
  const isMobile = useIsMobile()
  const { message } = App.useApp()
  const [data, setData] = useState<DashboardToday | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()])
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setData(await fetchDashboard())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const doExport = async () => {
    setExporting(true)
    try {
      await exportReport(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'))
      message.success('已开始下载')
    } catch {
      // 已统一提示
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

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>数据看板</Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}><Card loading={!data}><Statistic title="今日实收（支付 − 退款）" value={fenToYuan(data?.netIncome)} precision={2} prefix="¥" /></Card></Col>
        <Col xs={12} lg={6}><Card loading={!data}><Statistic title="今日订单" value={data?.orderCount ?? 0} suffix="单" /></Card></Col>
        <Col xs={12} lg={6}><Card loading={!data}><Statistic title="今日支付金额" value={fenToYuan(data?.paidAmount)} precision={2} prefix="¥" /></Card></Col>
        <Col xs={12} lg={6}><Card loading={!data}><Statistic title="今日退款" value={fenToYuan(data?.refundedAmount)} precision={2} prefix="¥" suffix={<Typography.Text type="secondary" style={{ fontSize: 14 }}>/ {data?.refundCount ?? 0} 笔</Typography.Text>} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="近 7 天实收" loading={!data} extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>按支付成功日期统计</Typography.Text>}>
            {data && <DailyBarChart data={data.daily} width={isMobile ? 360 : 640} />}
            {data && <Table size="small" rowKey="date" pagination={false} columns={dailyColumns} dataSource={data.daily} style={{ marginTop: 12 }} />}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="今日菜品销售排行" loading={!data}>
            <Table size="small" rowKey="dishName" pagination={false} columns={dishColumns} dataSource={data?.topDishes ?? []} locale={{ emptyText: '今日暂无销售' }} />
          </Card>
        </Col>
      </Row>

      <Card title="流水导出" extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>CSV：订单 + 支付 + 退款明细，可直接用 Excel 打开，用于人工对账</Typography.Text>}>
        <Space wrap>
          <DatePicker.RangePicker
            value={range}
            allowClear={false}
            onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])}
            disabledDate={(d) => d.isAfter(dayjs(), 'day')}
            presets={[
              { label: '今天', value: [dayjs(), dayjs()] },
              { label: '昨天', value: [dayjs().subtract(1, 'day'), dayjs().subtract(1, 'day')] },
              { label: '本周', value: [dayjs().startOf('week'), dayjs()] },
              { label: '本月', value: [dayjs().startOf('month'), dayjs()] },
              { label: '上月', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
            ]}
          />
          <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={doExport}>导出 CSV</Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>单次最多 92 天</Typography.Text>
        </Space>
      </Card>
    </Space>
  )
}
