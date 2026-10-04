import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Button, Card, Form, Image, Input, InputNumber, Modal, Popconfirm, Space, Switch, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons'
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
  return src ? <Image src={src} width={56} height={56} /> : null
}

/** 桌台管理：桌号维护、桌码预览 / 下载 / 批量打印 / 重置 */
export default function TablesPage() {
  const { message } = App.useApp()
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

  const columns: ColumnsType<TableItem> = [
    { title: '桌号', dataIndex: 'code', render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: number) => (v === 1 ? <Tag color="green">可用</Tag> : <Tag>停用</Tag>) },
    { title: '桌码', dataIndex: 'qrUrl', width: 90, render: (url: string) => <QrThumb url={url} /> },
    {
      title: '桌码链接',
      dataIndex: 'qrUrl',
      ellipsis: true,
      render: (url: string) => <Typography.Text copyable type="secondary" style={{ fontSize: 12 }}>{url}</Typography.Text>,
    },
    {
      title: '操作',
      width: isOwner ? 260 : 100,
      render: (_, r) => (
        <Space size={0} wrap>
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => downloadTableCard(storeName, r.code, r.qrUrl)}>下载</Button>
          {isOwner && (
            <>
              <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>
              <Popconfirm
                title="重置桌码？"
                description="旧桌码会立即失效，需要重新打印张贴。"
                onConfirm={async () => {
                  try {
                    await resetTableQr(r.id)
                    message.success('已重置，请重新打印')
                    void load()
                  } catch (e) {
                    ignoreShownError(e)  // 请求层已提示
                  }
                }}
              >
                <Button type="link" size="small">重置</Button>
              </Popconfirm>
              <Popconfirm title={`删除桌台 ${r.code}？`} okButtonProps={{ danger: true }} onConfirm={async () => {
                try {
                  await deleteTable(r.id)
                  void load()
                } catch (e) {
                  ignoreShownError(e)  // 请求层已提示
                }
              }}>
                <Button type="link" size="small" danger>删除</Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Card
      title="桌台管理"
      extra={
        <Space wrap>
          <Button
            icon={<PrinterOutlined />}
            disabled={tables.length === 0}
            onClick={() => navigate('/tables/print', { state: { ids: selected.length ? selected : tables.map((t) => t.id) } })}
          >
            {selected.length ? `打印选中（${selected.length}）` : '打印全部桌码'}
          </Button>
          {isOwner && <Button onClick={() => setBatchOpen(true)}>批量新建</Button>}
          {isOwner && <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit('new')}>新建桌台</Button>}
        </Space>
      }
    >
      <Table<TableItem>
        scroll={{ x: 'max-content' }}
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={tables}
        pagination={false}
        rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as number[]) }}
      />

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
    </Card>
  )
}
