import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { App, Badge, Button, Card, Col, Form, Input, InputNumber, Result, Row, Select, Space, Spin, Switch, Tag, Typography, Grid, theme as antdTheme } from 'antd'
import { SoundOutlined } from '@ant-design/icons'
import { fetchStore, setBusinessStatus, updateStore } from '../../api/store'
import type { StoreDetail, StoreUpdateRequest } from '../../api/types'
import ImageUpload from '../../components/ImageUpload'
import { ignoreShownError } from '../../utils/errors'
import { usePollStore } from '../../hooks/useOrderPoll'
import { playSound, SOUND_META, useSoundStore, type SoundKind } from '../../utils/sound'

/** 店铺设置（店主）：顶部为即时生效的营业状态 + 新订单提醒（本机）；下方店铺信息、业务参数需点保存 */
export default function SettingsPage() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<StoreUpdateRequest>()
  const [store, setStore] = useState<StoreDetail | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const { counts, remindIntervalMs, setRemindInterval } = usePollStore()
  const { enabled: soundEnabled, setEnabled: setSoundEnabled } = useSoundStore()
  const [previewKind, setPreviewKind] = useState<SoundKind>('newOrder')
  const { token } = antdTheme.useToken()
  const isNarrow = !Grid.useBreakpoint().lg

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const s = await fetchStore()
      setStore(s)
      form.setFieldsValue(s)
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示，这里只切换到可重试的错误态，避免永久转圈
      setLoadError(true)
    }
  }, [form])

  useEffect(() => {
    void load()
  }, [load])

  const toggleOpen = (open: boolean) => {
    modal.confirm({
      title: open ? '开始营业？' : '暂停营业？',
      content: open ? '顾客可以扫码下单。' : '顾客将无法下单，已支付的订单继续履约。',
      onOk: async () => setStore(await setBusinessStatus(open)),
    })
  }

  const save = async () => {
    const v = await form.validateFields().catch(() => null)
    if (!v || !store) {
      return
    }
    // 保存后全店立即生效（自动接单、超时自动退款等会直接影响顾客和员工）：列出改动项二次确认
    const changes = describeChanges(store, v)
    if (changes.length === 0) {
      message.info('没有需要保存的修改')
      return
    }
    const ok = await modal.confirm({
      title: '确认保存店铺设置？',
      width: 480,
      content: (
        <div>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>以下修改保存后立即对全店和顾客端生效：</Typography.Paragraph>
          <ul style={{ paddingInlineStart: 20, margin: 0 }}>
            {changes.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      ),
      okText: '确认保存',
    })
    if (!ok) return
    setSaving(true)
    try {
      const s = await updateStore(v)
      setStore(s)
      form.setFieldsValue(s)
      message.success('已保存')
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示；表单保留用户的修改
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return <Result status="error" title="店铺信息加载失败" extra={<Button type="primary" onClick={load}>重试</Button>} />
  }
  if (!store) {
    return <Spin />
  }

  const open = store.businessStatus === 1

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* 即时生效的开关集中在顶部：营业状态（全店）+ 新订单提醒（本机）；下方表单需要点「保存设置」 */}
      <Card styles={{ body: { padding: 0 } }}>
        <Row>
          <Col xs={24} lg={12} style={{ padding: '20px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Space size={8}>
                  <Typography.Text strong style={{ fontSize: 16 }}>营业状态</Typography.Text>
                  {open ? <Tag color="success">营业中</Tag> : <Tag>已打烊</Tag>}
                </Space>
                <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 13 }}>
                  {open ? '打烊后顾客无法下单，已支付订单继续履约' : '当前已打烊，顾客无法下单；开始营业后可扫码点餐'}
                </Typography.Paragraph>
              </div>
              <Switch checked={open} onChange={toggleOpen} aria-label="营业状态" />
            </div>
          </Col>
          <Col
            xs={24}
            lg={12}
            style={{
              padding: '20px 28px',
              // 宽屏左右并排用竖线分隔，窄屏上下堆叠用横线
              borderInlineStart: isNarrow ? undefined : `1px solid ${token.colorSplit}`,
              borderTop: isNarrow ? `1px solid ${token.colorSplit}` : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Space size={8}>
                  <Typography.Text strong style={{ fontSize: 16 }}>提示音</Typography.Text>
                  <Badge status={counts ? 'processing' : 'default'} text={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{counts ? '运行中' : '连接中…'}</Typography.Text>} />
                </Space>
                <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 13 }}>
                  新订单、取消申请、退款、断网等各有提示音；仅对当前浏览器生效，浏览器需点击页面后才能出声
                </Typography.Paragraph>
              </div>
              <Switch checked={soundEnabled} onChange={setSoundEnabled} aria-label="提示音总开关" />
            </div>
            <Space wrap size={8} style={{ marginTop: 12 }}>
              <SoundOutlined style={{ color: token.colorTextTertiary }} />
              <Select
                value={remindIntervalMs}
                onChange={setRemindInterval}
                disabled={!soundEnabled}
                style={{ width: 170 }}
                options={[
                  { value: 0, label: '未接单不重复提醒' },
                  { value: 30_000, label: '未接单每 30 秒提醒' },
                  { value: 60_000, label: '未接单每 1 分钟提醒' },
                  { value: 180_000, label: '未接单每 3 分钟提醒' },
                ]}
              />
              <Space.Compact>
                <Select<SoundKind>
                  value={previewKind}
                  onChange={setPreviewKind}
                  style={{ width: 150 }}
                  options={(Object.keys(SOUND_META) as SoundKind[]).map((k) => ({ value: k, label: SOUND_META[k].label }))}
                  aria-label="选择要试听的提示音"
                />
                <Button onClick={() => playSound(previewKind, { force: true })}>试听</Button>
              </Space.Compact>
            </Space>
          </Col>
        </Row>
      </Card>

      <Form form={form} layout="vertical" requiredMark={false}>
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}>
            <Card title="店铺信息" style={{ height: '100%' }}>
              <Form.Item name="name" label="店铺名称" rules={[{ required: true, whitespace: true, message: '请输入店铺名称' }]}>
                <Input size="large" maxLength={64} />
              </Form.Item>
              <Form.Item name="phone" label="联系电话">
                <Input size="large" maxLength={20} />
              </Form.Item>
              <Form.Item name="address" label="店铺地址">
                <Input size="large" maxLength={255} />
              </Form.Item>
              <Form.Item name="businessHours" label="营业时间" extra="仅展示用，如 10:00-22:00">
                <Input size="large" maxLength={64} />
              </Form.Item>
              <Form.Item name="logo" label="店铺 Logo" style={{ marginBottom: 0 }}>
                <ImageUpload />
              </Form.Item>
            </Card>
          </Col>
          <Col xs={24} xl={12}>
            <Card title="业务参数" style={{ height: '100%' }}>
              <SettingRow label="自动接单" hint="关（默认）：前厅确认后后厨才收到订单；开：支付成功直接进入后厨制作，视为店主授权跳过前厅确认">
                <Form.Item name="autoAccept" valuePropName="checked" noStyle>
                  <Switch />
                </Form.Item>
              </SettingRow>
              <SettingRow label="未支付自动关单" hint="下单后超过该时间未支付，订单自动关闭">
                <Form.Item name="payTimeoutMin" rules={[{ required: true, message: '必填' }]} style={{ margin: 0 }}>
                  <InputNumber size="large" min={5} max={60} precision={0} suffix="分钟" style={{ width: 140 }} />
                </Form.Item>
              </SettingRow>
              <SettingRow label="未接单自动退款" hint="手动接单模式下生效，超时未接单自动取消并退款">
                <Form.Item name="acceptTimeoutMin" rules={[{ required: true, message: '必填' }]} style={{ margin: 0 }}>
                  <InputNumber size="large" min={1} max={60} precision={0} suffix="分钟" style={{ width: 140 }} />
                </Form.Item>
              </SettingRow>
              <SettingRow label="售后申请时限" hint="订单送达后，顾客可在该时间内申请退款" last>
                <Form.Item name="afterSaleHours" rules={[{ required: true, message: '必填' }]} style={{ margin: 0 }}>
                  <InputNumber size="large" min={0} max={168} precision={0} suffix="小时" style={{ width: 140 }} />
                </Form.Item>
              </SettingRow>
            </Card>
          </Col>
        </Row>
      </Form>

      <Space size={16} wrap>
        <Button type="primary" size="large" loading={saving} onClick={save} style={{ minWidth: 200, height: 52, fontSize: 16 }}>保存设置</Button>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>修改即时同步到顾客端</Typography.Text>
      </Space>
    </Space>
  )
}

/** 业务参数的一行：左侧名称 + 说明，右侧控件（对应设计稿的设置项排版） */
function SettingRow({ label, hint, children, last = false }: { label: string; hint: string; children: ReactNode; last?: boolean }) {
  const { token } = antdTheme.useToken()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: last ? undefined : `1px solid ${token.colorSplit}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 4 }}>{hint}</div>
      </div>
      <div style={{ flex: 'none' }}>{children}</div>
    </div>
  )
}

const SETTING_LABELS: { key: keyof StoreUpdateRequest; label: string; unit?: string }[] = [
  { key: 'name', label: '店铺名称' },
  { key: 'phone', label: '联系电话' },
  { key: 'address', label: '店铺地址' },
  { key: 'businessHours', label: '营业时间' },
  { key: 'logo', label: '店铺 Logo' },
  { key: 'autoAccept', label: '自动接单' },
  { key: 'payTimeoutMin', label: '未支付自动关单', unit: '分钟' },
  { key: 'acceptTimeoutMin', label: '未接单自动退款', unit: '分钟' },
  { key: 'afterSaleHours', label: '售后申请时限', unit: '小时' },
]

/** 对比保存前后的设置，生成「自动接单：关 → 开」这样的改动说明 */
function describeChanges(before: StoreDetail, after: StoreUpdateRequest): string[] {
  const show = (v: unknown, unit?: string) => {
    if (typeof v === 'boolean') return v ? '开' : '关'
    if (v === null || v === undefined || v === '') return '（空）'
    return unit ? `${v} ${unit}` : String(v)
  }
  return SETTING_LABELS.flatMap(({ key, label, unit }) => {
    const a = (before as unknown as Record<string, unknown>)[key] ?? null
    const b = (after as unknown as Record<string, unknown>)[key] ?? null
    if ((a === '' ? null : a) === (b === '' ? null : b)) return []
    if (key === 'logo') return [`${label}：已更换`]
    return [`${label}：${show(a, unit)} → ${show(b, unit)}`]
  })
}
