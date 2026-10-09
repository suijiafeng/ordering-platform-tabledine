import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Alert, App, Button, Card, Col, DatePicker, Empty, Result, Row, Space, Table, Tooltip, Typography, theme as antdTheme } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined, InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { exportReport, fetchReportSummary } from '../../api/report'
import type { DailyPoint, ReportSummary } from '../../api/types'
import { formatYuan } from '../../utils/money'
import DailyBarChart from '../../components/DailyBarChart'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import { ignoreShownError } from '../../utils/errors'

/** 区间统计与导出共用的最大天数（与后端一致） */
const MAX_RANGE_DAYS = 92

type Range = [Dayjs, Dayjs]

/** 快捷区间：每次渲染时按当前日期计算（页面开过午夜后「今天」仍然正确） */
function quickRanges(): { label: string; value: Range }[] {
  const today = dayjs()
  return [
    { label: '今天', value: [today, today] },
    { label: '昨天', value: [today.subtract(1, 'day'), today.subtract(1, 'day')] },
    { label: '近7天', value: [today.subtract(6, 'day'), today] },
    { label: '近30天', value: [today.subtract(29, 'day'), today] },
  ]
}

/** 日期选择器下拉里的更多快捷项 */
function morePresets(): { label: string; value: Range }[] {
  const today = dayjs()
  return [
    { label: '本周', value: [today.startOf('week'), today] },
    { label: '本月', value: [today.startOf('month'), today] },
    { label: '上月', value: [today.subtract(1, 'month').startOf('month'), today.subtract(1, 'month').endOf('month')] },
  ]
}

const sameRange = (a: Range, b: Range) => a[0].isSame(b[0], 'day') && a[1].isSame(b[1], 'day')

/**
 * 数据看板（店主）：按日期区间看经营数据并导出 CSV 对账。
 * 今日的待办与实时数字放在工作台；这里只做区间分析，区间同时作用于统计与导出。
 */
export default function ReportsPage() {
  const isMobile = useIsMobile()
  const { message } = App.useApp()
  const { token } = antdTheme.useToken()
  const [range, setRange] = useState<Range>([dayjs().subtract(6, 'day'), dayjs()])
  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [exporting, setExporting] = useState(false)
  // 快速切换区间时只采纳最后一次请求的结果
  const beginLoad = useLatestRequest()

  const load = useCallback(async () => {
    const isLatest = beginLoad()
    setLoading(true)
    setError(false)
    try {
      const s = await fetchReportSummary(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'))
      if (isLatest()) setSummary(s)
    } catch (e) {
      if (isLatest()) setError(true)
      ignoreShownError(e)  // 请求层已提示；页面提供重试
    } finally {
      if (isLatest()) setLoading(false)
    }
  }, [range, beginLoad])

  useEffect(() => {
    void load()
  }, [load])

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

  const pickRange = (v: Range) => {
    if (v[1].diff(v[0], 'day') >= MAX_RANGE_DAYS) {
      message.warning(`单次最多统计 ${MAX_RANGE_DAYS} 天，请缩小范围`)
      return
    }
    setRange(v)
  }

  if (error && !summary) {
    return <Result status="error" title="看板加载失败" extra={<Button type="primary" onClick={() => void load()}>重试</Button>} />
  }

  const rangeText = `${range[0].format('MM-DD')} ~ ${range[1].format('MM-DD')}`
  const days = summary?.daily.length ?? range[1].diff(range[0], 'day') + 1

  const kpis: { title: ReactNode; value: ReactNode }[] = [
    { title: '区间实收', value: formatYuan(summary?.netIncome) },
    { title: '订单数', value: <>{summary?.orderCount ?? 0}<Unit>单</Unit></> },
    { title: '日均实收', value: formatYuan(summary ? Math.round(summary.netIncome / Math.max(1, days)) : 0) },
    { title: '退款', value: <>{formatYuan(summary?.refundedAmount)}<Unit>/ {summary?.refundCount ?? 0} 笔</Unit></> },
    {
      title: (
        <Tooltip title="会员充值是预收款，不计入实收">
          <span>会员充值 <InfoCircleOutlined style={{ fontSize: 12 }} /></span>
        </Tooltip>
      ),
      value: formatYuan(summary?.rechargeAmount),
    },
  ]

  const rankBadge = (i: number) => (
    <span style={{
      display: 'inline-flex', flex: 'none', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600,
      background: i < 3 ? token.colorPrimary : token.colorFillSecondary, color: i < 3 ? '#fff' : token.colorTextSecondary,
    }}>{i + 1}</span>
  )

  const dailyColumns: ColumnsType<DailyPoint> = [
    { title: '日期', dataIndex: 'date', render: (v: string) => dayjs(v).format('MM-DD ddd') },
    { title: '实收', dataIndex: 'netIncome', align: 'right', render: (v: number) => <Typography.Text strong>{formatYuan(v)}</Typography.Text> },
    { title: '订单', dataIndex: 'orderCount', align: 'right' },
    { title: '支付金额', dataIndex: 'paidAmount', align: 'right', render: (v: number) => formatYuan(v) },
    { title: '退款', dataIndex: 'refundedAmount', align: 'right', render: (v: number) => (v > 0 ? <Typography.Text type="danger">{formatYuan(v)}</Typography.Text> : formatYuan(v)) },
  ]
  // 明细表最新日期在前，图表保持时间正序
  const dailyDesc = summary ? [...summary.daily].reverse() : []

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Space wrap size={8}>
          <DatePicker.RangePicker
            value={range}
            allowClear={false}
            size="large"
            onChange={(v) => {
              if (v?.[0] && v[1]) pickRange([v[0], v[1]])
            }}
            disabledDate={(d) => d.isAfter(dayjs(), 'day')}
            presets={morePresets()}
          />
          {quickRanges().map((q) => (
            <Button key={q.label} size="large" type={sameRange(q.value, range) ? 'primary' : 'default'} onClick={() => pickRange(q.value)}>
              {q.label}
            </Button>
          ))}
        </Space>
        <Space wrap size={8}>
          <Tooltip title="刷新">
            <Button size="large" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()} aria-label="刷新" />
          </Tooltip>
          <Tooltip title={`导出 ${range[0].format('YYYY-MM-DD')} ~ ${range[1].format('YYYY-MM-DD')} 的订单 + 支付 + 退款明细，可直接用 Excel 打开对账`}>
            <Button size="large" color="primary" variant="outlined" icon={<DownloadOutlined />} loading={exporting} onClick={doExport}>导出 CSV</Button>
          </Tooltip>
        </Space>
      </Space>

      {/* 切换区间后加载失败时，下方仍是上一个区间的数据：明确提示，避免拿旧数字对账 */}
      {error && summary && (
        <Alert
          type="error"
          showIcon
          message={`${rangeText} 的数据加载失败，下方仍是 ${dayjs(summary.from).format('MM-DD')} ~ ${dayjs(summary.to).format('MM-DD')} 的数据`}
          action={<Button size="small" onClick={() => void load()}>重试</Button>}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 140 : 180}px, 1fr))`, gap: 16 }}>
        {kpis.map((k, i) => (
          <Card key={i} loading={!summary}>
            <Typography.Text type="secondary">{k.title}</Typography.Text>
            <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 700, marginTop: 8, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{k.value}</div>
          </Card>
        ))}
      </div>

      {/* 收款方式：会员余额与各类线下收款（前厅代客下单记账）分开统计，便于对账 */}
      {summary && (summary.byPayMethod?.length ?? 0) > 0 && (
        <Card title="收款方式" extra={<Typography.Text type="secondary">{rangeText} · 按支付成功日期</Typography.Text>}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 140 : 180}px, 1fr))`, gap: 16 }}>
            {summary.byPayMethod!.map((m) => {
              const share = summary.paidAmount > 0 ? Math.round((m.amount / summary.paidAmount) * 100) : 0
              return (
                <div key={m.method}>
                  <Typography.Text type="secondary">{m.label}</Typography.Text>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{formatYuan(m.amount)}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>{m.orderCount} 单 · 占 {share}%</Typography.Text>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card title="每日实收" extra={<Typography.Text type="secondary">{rangeText}</Typography.Text>} loading={!summary} style={{ height: '100%' }}>
            {summary && <DailyBarChart data={summary.daily} height={260} width={isMobile ? 360 : 640} label={`${rangeText} 每日实收`} />}
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="菜品销售排行" extra={<Typography.Text type="secondary">{rangeText}</Typography.Text>} loading={!summary} style={{ height: '100%' }}>
            {summary && summary.topDishes.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该区间暂无销售" />
            ) : (
              summary?.topDishes.map((d, i) => (
                <div key={d.dishName} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < summary.topDishes.length - 1 ? `1px solid ${token.colorSplit}` : undefined }}>
                  {rankBadge(i)}
                  <Typography.Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>{d.dishName}</Typography.Text>
                  <Typography.Text type="secondary" style={{ flex: 'none' }}>{d.quantity} 份</Typography.Text>
                  <Typography.Text style={{ flex: 'none', width: 88, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatYuan(d.amount)}</Typography.Text>
                </div>
              ))
            )}
          </Card>
        </Col>
      </Row>

      <Card title="每日明细" extra={<Typography.Text type="secondary">按支付成功日期统计，退款按退款成功日期，最多 {MAX_RANGE_DAYS} 天</Typography.Text>} loading={!summary}>
        <Table
          size="middle"
          rowKey="date"
          scroll={{ x: 'max-content' }}
          pagination={dailyDesc.length > 14 ? { pageSize: 14, showSizeChanger: false } : false}
          columns={dailyColumns}
          dataSource={dailyDesc}
        />
      </Card>
    </Space>
  )
}

function Unit({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4, opacity: 0.6 }}>{children}</span>
}
