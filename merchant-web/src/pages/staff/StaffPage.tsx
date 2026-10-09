import { useCallback, useEffect, useState } from 'react'
import { App, Button, Form, Input, Modal, Popconfirm, Radio, Space, Switch, Table, Tag, Typography, theme as antdTheme } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { createStaff, listStaff, setStaffEnabled, updateStaff } from '../../api/staff'
import type { StaffItem, StaffRole } from '../../api/types'
import { ROLE_META } from '../../utils/auth'
import { useAuthStore } from '../../store/auth'
import { ignoreShownError } from '../../utils/errors'
import Panel, { PageToolbar } from '../../components/Panel'

type EditState = 'new' | StaffItem | null
/** 可分配的岗位：店主由系统初始化，不能在这里设置 */
type WorkRole = Exclude<StaffRole, 'OWNER'>

/** 员工管理（店主）：新建店员、改名、重置密码、启用 / 停用 */
export default function StaffPage() {
  const { message, modal } = App.useApp()
  const { token } = antdTheme.useToken()
  const me = useAuthStore((s) => s.staff)
  const [list, setList] = useState<StaffItem[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<EditState>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ username: string; name: string; password?: string; role: WorkRole }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setList(await listStaff())
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
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
      form.setFieldsValue({ username: s.username, name: s.name, role: s.role === 'KITCHEN' ? 'KITCHEN' : 'STAFF' })
    }
    setEditing(s)
  }

  const save = async () => {
    const v = await form.validateFields().catch(() => null)
    if (!v) return
    setSaving(true)
    try {
      if (editing === 'new') {
        await createStaff({ username: v.username.trim(), name: v.name.trim(), password: v.password!, role: v.role })  // 密码原样提交，与登录时一致
        message.success(`已新建${ROLE_META[v.role].label}账号`)
      } else if (editing) {
        const password = v.password || undefined
        // 店主不能改角色；只有角色确实变化时才提交，避免无谓地让对方重新登录
        const role = editing.role !== 'OWNER' && v.role !== editing.role ? v.role : undefined
        if (password || role) {
          // 改岗位 / 重置密码会让对方立即下线，权限也随之变化：二次确认
          const changes = [
            role && `岗位改为「${ROLE_META[role].label}」`,
            password && '重置登录密码',
          ].filter(Boolean).join('、')
          const ok = await modal.confirm({
            title: `确认为「${editing.name}」${changes}？`,
            content: '保存后该员工会被立即退出登录，需要重新登录后才能继续操作。',
            okText: '确认保存',
            okButtonProps: { danger: true },
          })
          if (!ok) return
        }
        await updateStaff(editing.id, { name: v.name.trim(), password, role })
        message.success(password || role ? '已保存，该员工需重新登录后生效' : '已保存')
      }
      setEditing(null)
      void load()
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示；保持弹窗让用户修改
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (s: StaffItem, enabled: boolean) => {
    try {
      await setStaffEnabled(s.id, enabled)
      message.success(enabled ? '已启用' : '已停用，该员工会话已失效')
      void load()
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    }
  }

  const columns: ColumnsType<StaffItem> = [
    { title: '姓名', dataIndex: 'name', render: (v: string, r) => <Space><Typography.Text strong>{v}</Typography.Text>{r.id === me?.id && <Tag>我</Tag>}</Space> },
    { title: '登录账号', dataIndex: 'username' },
    { title: '角色', dataIndex: 'role', width: 90, render: (v: StaffRole) => <Tag color={ROLE_META[v].color}>{ROLE_META[v].label}</Tag> },
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
    <div>
      <PageToolbar>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => openEdit('new')}>新建员工</Button>
      </PageToolbar>
      <div style={{ background: token.colorInfoBg, borderRadius: token.borderRadiusLG, padding: '16px 24px', marginBottom: 16 }}>
        <Typography.Text strong>权限说明 · 前厅确认订单后，后厨才收到制作指令</Typography.Text>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: '26px', color: token.colorTextSecondary }}>
          <div>前厅可：代客下单（登记线下收款）/ 接单 / 拒单 / 送达 / 出餐 / 沽清 / 会员管理（开户、编辑、充值、重置密码、启停）</div>
          <div>后厨可：在后厨队列开始制作 / 出餐；订单管理、菜品管理只能查看，不能接单、拒单、送达、沽清</div>
          <div>仅店主可：退款审核 · 菜品桌台维护 · 店铺设置 · 数据看板与导出 · 员工管理</div>
        </div>
      </div>
      <Panel>
        <Table rowKey="id" columns={columns} dataSource={list} loading={loading} pagination={false} scroll={{ x: 'max-content' }} />
      </Panel>

      <Modal
        title={isNew ? '新建员工' : '编辑员工'}
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
          {(isNew || (editing && editing.role !== 'OWNER')) && (
            <Form.Item
              name="role"
              label="岗位"
              initialValue="STAFF"
              extra={isNew ? '前厅确认订单后，后厨才会收到制作指令' : '修改岗位后，该员工需重新登录'}
            >
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                options={[
                  { value: 'STAFF', label: '前厅：接单 / 拒单 / 送达' },
                  { value: 'KITCHEN', label: '后厨：出餐' },
                ]}
              />
            </Form.Item>
          )}
          {isSelf ? (
            <Typography.Text type="secondary">修改自己的密码请使用右上角头像菜单中的「修改密码」（需验证当前密码）</Typography.Text>
          ) : (
          <Form.Item
            name="password"
            label={isNew ? '初始密码' : '重置密码'}
            extra={isNew ? undefined : '留空则不修改；填写后该员工需用新密码重新登录'}
            rules={[{ required: isNew, min: 6, max: 64, message: '密码长度 6~64 位' }, { pattern: /^\S*$/, message: '密码不能包含空格' }]}
          >
            <Input.Password placeholder={isNew ? '6~64 位' : '留空不修改'} />
          </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  )
}
