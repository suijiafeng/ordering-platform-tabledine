import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Button, Checkbox, Dropdown, Empty, Form, Input, InputNumber, Modal, Space, Spin, Switch, Typography, theme as antdTheme } from 'antd'
import { DownloadOutlined, EllipsisOutlined, LinkOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons'
import { createTable, createTablesBatch, deleteTable, listTables, resetTableQr, updateTable } from '../../api/table'
import { fetchStore } from '../../api/store'
import type { TableItem } from '../../api/types'
import { downloadTableCard, qrDataUrl } from '../../utils/qrcode'
import { useIsOwner } from '../../utils/auth'
import { ignoreShownError } from '../../utils/errors'

function QrThumb({ url }: { url: string }) {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    // 二维码生成失败只是缩略图不显示，不影响列表
    qrDataUrl(url, 240).then(setSrc).catch(() => setSrc(undefined))
  }, [url])
  return src ? <img src={src} width={120} height={120} alt="桌码" style={{ display: 'block' }} /> : <div style={{ width: 120, height: 120 }} />
}

/**
 * 复制文本：优先用 Clipboard API；它只在 https / localhost 下可用，
 * 用局域网 IP（http）访问后台时退回 execCommand('copy')。
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 继续尝试旧方式
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    ta.remove()
  }
}

/** 桌台管理：桌号维护、桌码预览 / 下载 / 批量打印 / 重置 */
export default function TablesPage() {
  const { message, modal } = App.useApp()
  const { token } = antdTheme.useToken()
  const navigate = useNavigate()
  const isOwner = useIsOwner()
  const [tables, setTables] = useState<TableItem[]>([])
  const [storeName, setStoreName] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [editing, setEditing] = useState<TableItem | 'new' | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm] = Form.useForm<{ code: string; enabled: boolean }>()
  const [batchForm] = Form.useForm<{ prefix: string; from: number; to: number }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listTables()
      setTables(list)
      // 删除 / 重置后清理已不存在的选中项，避免「打印选中（N）」计数虚高
      setSelected((prev) => prev.filter((id) => list.some((t) => t.id === id)))
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    fetchStore().then((s) => setStoreName(s.name)).catch(() => {})
  }, [load])

  const openEdit = (t: TableItem | 'new') => setEditing(t)

  const saveEdit = async () => {
    const v = await editForm.validateFields().catch(() => null)
    if (!v) {
      return
    }
    // 在编辑表单里停用桌台，与卡片菜单里的「停用」同样需要二次确认
    if (editing && editing !== 'new' && editing.status === 1 && !v.enabled) {
      const ok = await modal.confirm({
        title: `停用桌台 ${editing.code}？`,
        content: '停用后该桌码立即无法点餐，已有订单不受影响。',
        okText: '确认停用',
        okButtonProps: { danger: true },
      })
      if (!ok) return
    }
    setSaving(true)
    try {
      if (editing === 'new') {
        await createTable(v.code.trim())
      } else if (editing) {
        await updateTable(editing.id, { code: v.code.trim(), status: v.enabled ? 1 : 0 })
      }
      setEditing(null)
      void load()
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示；保持弹窗打开让用户修改
    } finally {
      setSaving(false)
    }
  }

  const saveBatch = async () => {
    const v = await batchForm.validateFields().catch(() => null)
    if (!v) {
      return
    }
    setSaving(true)
    try {
      const created = await createTablesBatch({ prefix: v.prefix?.trim() ?? '', from: v.from, to: v.to })
      message.success(`已新建 ${created.length} 张桌台（已存在的桌号自动跳过）`)
      setBatchOpen(false)
      void load()
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    } finally {
      setSaving(false)
    }
  }

  const resetQr = (t: TableItem) => {
    modal.confirm({
      title: `重置桌码 ${t.code}？`,
      content: '重置后旧桌码立即失效，需要重新打印张贴。',
      okText: '重置桌码',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await resetTableQr(t.id)
          message.success('已重置，请重新打印')
          void load()
        } catch (e) {
          ignoreShownError(e)  // 请求层已提示
        }
      },
    })
  }

  const toggleStatus = (t: TableItem) => {
    const enabling = t.status !== 1
    const run = async () => {
      try {
        await updateTable(t.id, { code: t.code, status: enabling ? 1 : 0 })
        message.success(enabling ? `桌台 ${t.code} 已启用` : `桌台 ${t.code} 已停用`)
        void load()
      } catch (e) {
        ignoreShownError(e)  // 请求层已提示
      }
    }
    if (enabling) {
      modal.confirm({
        title: `启用桌台 ${t.code}？`,
        content: '启用后顾客可以扫这张桌码点餐。',
        okText: '确认启用',
        onOk: run,
      })
      return
    }
    modal.confirm({
      title: `停用桌台 ${t.code}？`,
      content: '停用后该桌码立即无法点餐，已有订单不受影响。',
      okText: '确认停用',
      okButtonProps: { danger: true },
      onOk: run,
    })
  }

  const remove = (t: TableItem) => {
    modal.confirm({
      title: `删除桌台 ${t.code}？`,
      content: '删除后该桌码无法再点餐，此操作不可撤销。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteTable(t.id)
          void load()
        } catch (e) {
          ignoreShownError(e)  // 请求层已提示
        }
      },
    })
  }

  const copyLink = async (url: string) => {
    if (await copyText(url)) {
      message.success('桌码链接已复制')
      return
    }
    // 两种方式都失败（极少见）：把链接展示出来，方便手动选中复制
    modal.info({ title: '请手动复制桌码链接', content: <Typography.Text copyable style={{ wordBreak: 'break-all' }}>{url}</Typography.Text> })
  }

  const toggleSelect = (id: number, checked: boolean) =>
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))

  const tableCard = (t: TableItem) => {
    const checked = selected.includes(t.id)
    const disabled = t.status !== 1
    const pill = disabled
      ? { text: '已停用', bg: token.colorErrorBg, color: token.colorError }
      : { text: '可用', bg: token.colorSuccessBg, color: token.colorSuccess }
    return (
      <div
        key={t.id}
        className="table-card"
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => toggleSelect(t.id, !checked)}
        onKeyDown={(e) => {
          // 只响应卡片本身获得焦点时的按键；内部按钮、下拉菜单（经 portal 冒泡上来）的回车 / 空格交给它们自己
          if (e.target !== e.currentTarget) return
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            toggleSelect(t.id, !checked)
          }
        }}
        style={{
          position: 'relative',
          background: token.colorBgContainer,
          borderRadius: 12,
          padding: '20px 20px 0',
          cursor: 'pointer',
          // 选中：主色描边（用 box-shadow，不改变卡片尺寸）
          boxShadow: checked ? `0 0 0 2px ${token.colorPrimary}` : undefined,
        }}
      >
        {/* 勾选框：未选中时只在悬停 / 有选中项时出现，保持卡片干净 */}
        <Checkbox
          className={checked || selected.length > 0 ? undefined : 'table-card-check'}
          checked={checked}
          style={{ position: 'absolute', top: 14, left: 14 }}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => toggleSelect(t.id, e.target.checked)}
          aria-label={`选择桌台 ${t.code}`}
        />
        <div style={{ display: 'flex', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
          <QrThumb url={t.qrUrl} />
        </div>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, color: token.colorText }}>{t.code}</div>
          <span style={{ display: 'inline-block', marginTop: 8, padding: '0 12px', lineHeight: '26px', borderRadius: 13, fontSize: 13, fontWeight: 500, background: pill.bg, color: pill.color }}>
            {pill.text}
          </span>
        </div>
        <div
          style={{ display: 'flex', alignItems: 'center', marginTop: 14, borderTop: `1px solid ${token.colorSplit}`, height: 46 }}
          onClick={(e) => e.stopPropagation()}
        >
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => downloadTableCard(storeName, t.code, t.qrUrl)}>下载</Button>
          <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => void copyLink(t.qrUrl)}>复制链接</Button>
          {isOwner && (
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              menu={{
                items: [
                  { key: 'edit', label: '编辑桌号' },
                  { key: 'status', label: disabled ? '启用' : '停用' },
                  { key: 'reset', label: '重置桌码' },
                  { type: 'divider' },
                  { key: 'delete', label: '删除', danger: true },
                ],
                onClick: ({ key }) => {
                  if (key === 'edit') openEdit(t)
                  else if (key === 'status') toggleStatus(t)
                  else if (key === 'reset') resetQr(t)
                  else if (key === 'delete') remove(t)
                },
              }}
            >
              <Button type="text" size="small" icon={<EllipsisOutlined />} aria-label={`桌台 ${t.code} 更多操作`} style={{ marginLeft: 'auto', color: token.colorTextSecondary }} />
            </Dropdown>
          )}
        </div>
      </div>
    )
  }

  const allSelected = tables.length > 0 && selected.length === tables.length

  return (
    <div>
      <style>{`
        .table-card { transition: box-shadow .15s, transform .15s; }
        .table-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(41, 37, 36, .08); }
        .table-card .table-card-check { opacity: 0; transition: opacity .15s; }
        .table-card:hover .table-card-check, .table-card:focus-visible .table-card-check { opacity: 1; }
        .table-card:focus-visible { outline: 2px solid ${token.colorPrimary}; outline-offset: 2px; }
      `}</style>
      <Space size={12} wrap>
        {isOwner && <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => openEdit('new')}>新建桌台</Button>}
        {isOwner && <Button size="large" onClick={() => setBatchOpen(true)}>批量新建</Button>}
        <Button
          size="large"
          icon={<PrinterOutlined />}
          disabled={tables.length === 0}
          onClick={() => navigate(selected.length ? `/tables/print?ids=${selected.join(',')}` : '/tables/print')}
        >
          {selected.length ? `打印选中（${selected.length}）` : '批量打印'}
        </Button>
      </Space>
      <div style={{ margin: '16px 0 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {selected.length
            ? `已选 ${selected.length} 张`
            : `共 ${tables.length} 张 · 勾选卡片后只打印选中的，不勾选则打印全部可用桌台`}
        </Typography.Text>
        {tables.length > 0 && (
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setSelected(allSelected ? [] : tables.map((t) => t.id))}>
            {allSelected ? '取消全选' : '全选'}
          </Button>
        )}
        {selected.length > 0 && !allSelected && (
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setSelected([])}>清空</Button>
        )}
      </div>
      <Spin spinning={loading}>
        {tables.length === 0 ? (
          <div style={{ background: token.colorBgContainer, borderRadius: 12, padding: '48px 0' }}>
            <Empty description={loading ? '加载中…' : '还没有桌台'}>
              {isOwner && !loading && <Button type="primary" onClick={() => setBatchOpen(true)}>批量新建桌台</Button>}
            </Empty>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 24 }}>
            {tables.map(tableCard)}
          </div>
        )}
      </Spin>

      <Modal title={editing === 'new' ? '新建桌台' : '编辑桌台'} open={editing !== null} onOk={saveEdit} confirmLoading={saving} onCancel={() => setEditing(null)} destroyOnHidden>
        {/* Modal 关闭时销毁内容，初始值通过 initialValues 传入（打开前 setFieldsValue 会因表单未挂载而丢失） */}
        <Form
          form={editForm}
          layout="vertical"
          preserve={false}
          initialValues={editing && editing !== 'new' ? { code: editing.code, enabled: editing.status === 1 } : { code: '', enabled: true }}
        >
          <Form.Item name="code" label="桌号" rules={[{ required: true, whitespace: true, message: '请输入桌号' }]}>
            <Input maxLength={16} placeholder="如：A1、包间2" />
          </Form.Item>
          {editing !== 'new' && (
            <Form.Item name="enabled" label="可用" valuePropName="checked" extra="停用后该桌码无法点餐">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal title="批量新建桌台" open={batchOpen} onOk={saveBatch} confirmLoading={saving} onCancel={() => setBatchOpen(false)} destroyOnHidden>
        <Form form={batchForm} layout="inline" preserve={false} initialValues={{ prefix: 'A', from: 1, to: 10 }}>
          <Form.Item name="prefix" label="前缀">
            <Input maxLength={8} style={{ width: 80 }} />
          </Form.Item>
          <Form.Item name="from" label="从" rules={[{ required: true }]}>
            <InputNumber min={1} max={999} />
          </Form.Item>
          <Form.Item
            name="to"
            label="到"
            dependencies={['from']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator: (_, to: number) => {
                  const from = getFieldValue('from') as number
                  if (to < from) return Promise.reject(new Error('结束序号不能小于起始序号'))
                  if (to - from >= 200) return Promise.reject(new Error('一次最多 200 张'))
                  return Promise.resolve()
                },
              }),
            ]}
          >
            <InputNumber min={1} max={999} />
          </Form.Item>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          例如前缀 A、从 1 到 10，生成 A1 ~ A10；一次最多 200 张。
        </Typography.Paragraph>
      </Modal>
    </div>
  )
}
