import { useCallback, useEffect, useState } from 'react'
import { Button, DatePicker, Descriptions, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { listAuditLogs } from '../../api/audit'
import { listStaff } from '../../api/staff'
import type { AuditLogItem, AuditOpType, StaffItem } from '../../api/types'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import { ROLE_META } from '../../utils/auth'
import { ignoreShownError } from '../../utils/errors'
import Panel, { PageToolbar } from '../../components/Panel'

const PAGE_SIZE = 20

/** 操作类别（与后端 AuditOpType 一致），颜色按风险：资金 / 账号权限 / 删除最醒目 */
const OP_TYPES: Record<AuditOpType, { label: string; color: string }> = {
  FUND: { label: '资金', color: 'red' },
  SECURITY: { label: '账号权限', color: 'volcano' },
  DELETE: { label: '删除', color: 'magenta' },
  EXPORT: { label: '导出', color: 'purple' },
  VIEW: { label: '敏感查看', color: 'geekblue' },
  LOGIN: { label: '登录认证', color: 'blue' },
  STATUS: { label: '状态流转', color: 'cyan' },
  CREATE: { label: '新增', color: 'green' },
  UPDATE: { label: '修改', color: 'gold' },
  SYSTEM: { label: '系统自动', color: 'default' },
}

/** 模块（与后端拦截器的模块映射一致） */
const CATEGORIES = ['订单', '退款', '会员', '菜品', '桌台', '员工', '店铺设置', '数据', '登录', '顾客', '支付', '余额', '文件', '审计']

const ACTOR_LABEL: Record<AuditLogItem['actorType'], string> = { STAFF: '员工', CUSTOMER: '顾客', SYSTEM: '系统', ANONYMOUS: '未登录' }

/** 操作人筛选：具体员工，或按身份（顾客 / 系统 / 未登录） */
type ActorFilter = { kind: 'staff'; id: number } | { kind: 'type'; type: AuditLogItem['actorType'] } | null

/**
 * 操作日志（店主）：员工、顾客、系统的一切写操作、登录与敏感数据查看都会留痕。
 * 日志只能追加，任何人都不能修改或删除；查看本页也会被记录。
 */
export default function AuditLogsPage() {
  // 默认查全部时间；选了日期区间才按区间过滤
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [opType, setOpType] = useState<AuditOpType | undefined>()
  const [category, setCategory] = useState<string | undefined>()
  const [actor, setActor] = useState<ActorFilter>(null)
  const [success, setSuccess] = useState<boolean | undefined>()
  const [keyword, setKeyword] = useState('')
  // 输入框里正在编辑的关键字：点「查询」或回车才生效
  const [keywordInput, setKeywordInput] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ list: AuditLogItem[]; total: number }>({ list: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [staff, setStaff] = useState<StaffItem[]>([])
  const beginLoad = useLatestRequest()

  useEffect(() => {
    listStaff().then(setStaff).catch(() => setStaff([]))
  }, [])

  const load = useCallback(async () => {
    const isLatest = beginLoad()
    setLoading(true)
    try {
      const res = await listAuditLogs({
        from: range?.[0].format('YYYY-MM-DD'),
        to: range?.[1].format('YYYY-MM-DD'),
        opType,
        category,
        actorType: actor?.kind === 'type' ? actor.type : actor?.kind === 'staff' ? 'STAFF' : undefined,
        actorId: actor?.kind === 'staff' ? actor.id : undefined,
        success,
        keyword: keyword || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      if (isLatest()) setData(res)
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    } finally {
      if (isLatest()) setLoading(false)
    }
  }, [range, opType, category, actor, success, keyword, page, beginLoad])

  useEffect(() => {
    void load()
  }, [load])

  // 改任何筛选条件都回到第一页
  const filter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1) }

  /** 查询：应用输入框里的关键字并重新加载（条件没变时等同于刷新） */
  const search = () => {
    const k = keywordInput.trim()
    if (k !== keyword || page !== 1) {
      setKeyword(k)
      setPage(1)
    } else {
      void load()
    }
  }

  /** 重置：所有条件恢复为「全部」 */
  const reset = () => {
    setRange(null)
    setOpType(undefined)
    setCategory(undefined)
    setActor(null)
    setSuccess(undefined)
    setKeyword('')
    setKeywordInput('')
    setPage(1)
  }

  const columns: ColumnsType<AuditLogItem> = [
    { title: '时间', dataIndex: 'createdAt', width: 150, render: (v: string) => dayjs(v).format('MM-DD HH:mm:ss') },
    {
      title: '操作人',
      width: 180,
      render: (_, r) => (
        <Space size={4} wrap>
          <Typography.Text>{r.actorName ?? ACTOR_LABEL[r.actorType]}</Typography.Text>
          {r.actorType === 'STAFF' && r.actorRole
            ? <Tag color={ROLE_META[r.actorRole].color} style={{ marginInlineEnd: 0 }}>{ROLE_META[r.actorRole].label}</Tag>
            : r.actorType !== 'STAFF' && <Tag style={{ marginInlineEnd: 0 }}>{ACTOR_LABEL[r.actorType]}</Tag>}
        </Space>
      ),
    },
    { title: '类别', dataIndex: 'opType', width: 96, render: (v: AuditOpType) => <Tag color={OP_TYPES[v]?.color}>{OP_TYPES[v]?.label ?? v}</Tag> },
    { title: '模块', dataIndex: 'category', width: 90 },
    { title: '操作', dataIndex: 'action', render: (v: string, r) => <Typography.Text strong={r.opType === 'FUND' || r.opType === 'SECURITY'}>{v}</Typography.Text> },
    { title: '对象', dataIndex: 'target', ellipsis: true, render: (v: string | null) => v ?? <Typography.Text type="secondary">-</Typography.Text> },
    {
      title: '结果',
      width: 150,
      render: (_, r) => r.success
        ? <Tag color="success">成功</Tag>
        : (
          <Tooltip title={r.errorMessage}>
            <Tag color="error">失败{r.errorCode ? ` · ${r.errorCode}` : ''}</Tag>
          </Tooltip>
        ),
    },
    { title: 'IP', dataIndex: 'ip', width: 130, render: (v: string | null) => v ?? '-' },
  ]

  const expanded = (r: AuditLogItem) => (
    <Descriptions size="small" column={1} bordered style={{ margin: '4px 0' }}>
      {r.path && <Descriptions.Item label="请求">{r.httpMethod} {r.path}</Descriptions.Item>}
      {!r.success && <Descriptions.Item label="失败原因">{r.errorMessage ?? '-'}（{r.errorCode ?? '-'}）</Descriptions.Item>}
      <Descriptions.Item label="参数">
        {r.detail
          ? <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>{pretty(r.detail)}</pre>
          : <Typography.Text type="secondary">无</Typography.Text>}
      </Descriptions.Item>
      {r.durationMs != null && <Descriptions.Item label="耗时">{r.durationMs} ms</Descriptions.Item>}
      {r.userAgent && <Descriptions.Item label="设备">{r.userAgent}</Descriptions.Item>}
    </Descriptions>
  )

  return (
    <div>
      <PageToolbar>
        <DatePicker.RangePicker
          size="large"
          value={range}
          allowClear
          placeholder={['开始时间', '结束时间']}
          disabledDate={(d) => d.isAfter(dayjs(), 'day')}
          presets={[
            { label: '今天', value: [dayjs(), dayjs()] },
            { label: '近 7 天', value: [dayjs().subtract(6, 'day'), dayjs()] },
            { label: '近 30 天', value: [dayjs().subtract(29, 'day'), dayjs()] },
          ]}
          onChange={(v) => filter(setRange)(v?.[0] && v[1] ? [v[0], v[1]] : null)}
        />
        <Select
          size="large"
          allowClear
          placeholder="全部类别"
          style={{ width: 140 }}
          value={opType}
          onChange={filter(setOpType)}
          options={(Object.keys(OP_TYPES) as AuditOpType[]).map((k) => ({ value: k, label: OP_TYPES[k].label }))}
        />
        <Select
          size="large"
          allowClear
          placeholder="全部模块"
          style={{ width: 130 }}
          value={category}
          onChange={filter(setCategory)}
          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
        <Select
          size="large"
          allowClear
          placeholder="全部操作人"
          style={{ width: 170 }}
          value={actor ? (actor.kind === 'staff' ? `staff:${actor.id}` : `type:${actor.type}`) : undefined}
          onChange={(v?: string) => {
            setPage(1)
            if (!v) { setActor(null); return }
            const [kind, value] = v.split(':')
            setActor(kind === 'staff' ? { kind: 'staff', id: Number(value) } : { kind: 'type', type: value as AuditLogItem['actorType'] })
          }}
          options={[
            { label: '员工', options: staff.map((s) => ({ value: `staff:${s.id}`, label: `${s.name}（${ROLE_META[s.role].label}）` })) },
            { label: '其他', options: [
              { value: 'type:CUSTOMER', label: '顾客' },
              { value: 'type:SYSTEM', label: '系统自动' },
              { value: 'type:ANONYMOUS', label: '未登录（登录失败）' },
            ] },
          ]}
        />
        <Select
          size="large"
          allowClear
          placeholder="全部结果"
          style={{ width: 120 }}
          value={success === undefined ? undefined : success ? 'ok' : 'fail'}
          onChange={(v?: string) => filter(setSuccess)(v === undefined ? undefined : v === 'ok')}
          options={[{ value: 'ok', label: '成功' }, { value: 'fail', label: '失败' }]}
        />
        <Input
          size="large"
          allowClear
          placeholder="订单号 / 操作 / 对象 / 参数"
          style={{ width: 260, maxWidth: '100%' }}
          value={keywordInput}
          onChange={(e) => {
            setKeywordInput(e.target.value)
            // 点输入框的清除按钮：立即恢复为不按关键字过滤
            if (!e.target.value && keyword) filter(setKeyword)('')
          }}
          onPressEnter={search}
        />
        <Button size="large" type="primary" icon={<SearchOutlined />} loading={loading} onClick={search}>查询</Button>
        <Button size="large" icon={<ReloadOutlined />} onClick={reset}>重置</Button>
      </PageToolbar>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
        记录员工、顾客与系统的所有写操作、登录和敏感数据查看；日志只能追加，任何人都无法修改或删除。查看本页同样会被记录。
      </Typography.Paragraph>
      <Panel>
        <Table<AuditLogItem>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={data.list}
          scroll={{ x: 'max-content' }}
          expandable={{ expandedRowRender: expanded, expandRowByClick: true }}
          pagination={{ current: page, pageSize: PAGE_SIZE, total: data.total, onChange: setPage, showSizeChanger: false, showTotal: (t) => `共 ${t} 条` }}
        />
      </Panel>
    </div>
  )
}

/** 参数 JSON 缩进展示；被截断的 JSON 解析失败时原样显示 */
function pretty(detail: string): string {
  try {
    return JSON.stringify(JSON.parse(detail), null, 2)
  } catch {
    return detail
  }
}
