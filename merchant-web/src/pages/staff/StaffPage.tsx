import { useCallback, useEffect, useState } from 'react'
import { App, Button, Card, Form, Input, Modal, Popconfirm, Space, Switch, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { createStaff, listStaff, setStaffEnabled, updateStaff } from '../../api/staff'
import type { StaffItem } from '../../api/types'
import { useAuthStore } from '../../store/auth'

type EditState = 'new' | StaffItem | null

/** 员工管理（店主）：新建店员、改名、重置密码、启用 / 停用 */
export default function StaffPage() {
  const { message } = App.useApp()
  const me = useAuthStore((s) => s.staff)
  const [list, setList] = useState<StaffItem[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<EditState>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ username: string; name: string; password?: string }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setList(await listStaff())
    } catch {
      // 已统一提示
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openEdit = (s: EditState) => {
    form.resetFields()
    if (s && s !== 'new') {
      form.setFieldsValue({ username: s.username, name: s.name })
    }
    setEditing(s)
  }

  const save = async () => {
    const v = await form.validateFields().catch(() => null)
    if (!v) return
    setSaving(true)
    try {
      if (editing === 'new') {
        await createStaff({ username: v.username.trim(), name: v.name.trim(), password: v.password! })
        message.success('已新建店员账号')
      } else if (editing) {
        await updateStaff(editing.id, { name: v.name.trim(), password: v.password?.trim() || undefined })
        message.success(v.password ? '已保存，该员工需用新密码重新登录' : '已保存')
      }
      setEditing(null)
      void load()
    } catch {
      // 保持弹窗让用户修改
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (s: StaffItem, enabled: boolean) => {
    try {
      await setStaffEnabled(s.id, enabled)
      message.success(enabled ? '已启用' : '已停用，该员工会话已失效')
      void load()
    } catch {
      // 已统一提示
    }
  }

  const columns: ColumnsType<StaffItem> = [
    { title: '姓名', dataIndex: 'name', render: (v: string, r) => <Space><Typography.Text strong>{v}</Typography.Text>{r.id === me?.id && <Tag>我</Tag>}</Space> },
    { title: '登录账号', dataIndex: 'username' },
    { title: '角色', dataIndex: 'role', width: 90, render: (v: string) => (v === 'OWNER' ? <Tag color="gold">店主</Tag> : <Tag color="blue">店员</Tag>) },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 100,
      render: (v: boolean, r) =>
        r.role === 'OWNER' ? (
          <Tag color="green">启用</Tag>
        ) : (
          <Popconfirm
            title={v ? '停用该员工？' : '启用该员工？'}
            description={v ? '停用后其已登录的会话立即失效。' : undefined}
            onConfirm={() => toggle(r, !v)}
          >
            <Switch checked={v} checkedChildren="启用" unCheckedChildren="停用" />
          </Popconfirm>
        ),
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 160, render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作',
      width: 120,
      render: (_, r) =>
        r.role === 'OWNER' && r.id !== me?.id ? null : (
          <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>
        ),
    },
  ]

  const isNew = editing === 'new'
  const isSelf = editing !== null && editing !== 'new' && editing.id === me?.id

  return (
    <Card
      title="员工管理"
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit('new')}>新建店员</Button>}
    >
      <Typography.Paragraph type="secondary">
        店员可以接单、拒单、出餐、送达、沽清和查看订单；退款审核、菜品桌台维护、店铺设置、看板与导出仅店主可用。
      </Typography.Paragraph>
      <Table rowKey="id" columns={columns} dataSource={list} loading={loading} pagination={false} scroll={{ x: 'max-content' }} />

      <Modal
        title={isNew ? '新建店员' : '编辑员工'}
        open={editing !== null}
        onOk={save}
        onCancel={() => setEditing(null)}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item
            name="username"
            label="登录账号"
            rules={isNew ? [{ required: true, pattern: /^[A-Za-z0-9_]{3,32}$/, message: '3~32 位字母、数字或下划线' }] : []}
          >
            <Input disabled={!isNew} placeholder="字母、数字或下划线" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, max: 32, message: '请输入姓名（最多 32 字）' }]}>
            <Input />
          </Form.Item>
          {isSelf ? (
            <Typography.Text type="secondary">修改自己的密码请使用右上角头像菜单中的「修改密码」（需验证当前密码）</Typography.Text>
          ) : (
          <Form.Item
            name="password"
            label={isNew ? '初始密码' : '重置密码'}
            extra={isNew ? undefined : '留空则不修改；填写后该员工需用新密码重新登录'}
            rules={[{ required: isNew, min: 6, max: 64, message: '密码长度 6~64 位' }]}
          >
            <Input.Password placeholder={isNew ? '6~64 位' : '留空不修改'} />
          </Form.Item>
          )}
        </Form>
      </Modal>
    </Card>
  )
}
