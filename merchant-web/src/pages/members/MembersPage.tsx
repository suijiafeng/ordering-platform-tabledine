import { useCallback, useEffect, useState } from 'react'
import { App, Button, Card, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Space, Switch, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, WalletOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { createMember, listMemberTransactions, listMembers, rechargeMember, setMemberEnabled, updateMember } from '../../api/member'
import type { MemberItem, WalletTransaction } from '../../api/types'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import { useIsOwner } from '../../utils/auth'
import { ignoreShownError } from '../../utils/errors'
import { fenToYuan, formatYuan, yuanToFen } from '../../utils/money'

const PAGE_SIZE = 20

type EditState = 'new' | MemberItem | null

const TXN_TYPE: Record<WalletTransaction['type'], { label: string; color: string }> = {
  RECHARGE: { label: '充值', color: 'green' },
  PAY: { label: '消费', color: 'orange' },
  REFUND: { label: '退款返还', color: 'blue' },
}

/**
 * 会员充值：会员账号由商家创建（手机号 + 密码），余额由商家充值，H5 下单直接从余额扣费。
 * 所有员工可查看会员与流水；建号、改密、停用、充值仅店主（涉及资金）。
 */
export default function MembersPage() {
  const { message } = App.useApp()
  const isOwner = useIsOwner()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ list: MemberItem[]; total: number }>({ list: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const beginLoad = useLatestRequest()

  const [editing, setEditing] = useState<EditState>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ phone: string; name: string; password?: string; initialYuan?: number }>()

  const [recharging, setRecharging] = useState<MemberItem | null>(null)
  const [rechargeForm] = Form.useForm<{ yuan: number; remark?: string }>()

  const [txnMember, setTxnMember] = useState<MemberItem | null>(null)

  const load = useCallback(async () => {
    const isLatest = beginLoad()
    setLoading(true)
    try {
      const res = await listMembers({ keyword: keyword || undefined, page, pageSize: PAGE_SIZE })
      if (isLatest()) setData(res)
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    } finally {
      if (isLatest()) setLoading(false)
    }
  }, [keyword, page, beginLoad])

  useEffect(() => {
    void load()
  }, [load])

  const openEdit = (m: EditState) => {
    form.resetFields()
    if (m && m !== 'new') {
      form.setFieldsValue({ phone: m.phone, name: m.name })
    }
    setEditing(m)
  }

  const save = async () => {
    const v = await form.validateFields().catch(() => null)
    if (!v) return
    setSaving(true)
    try {
      if (editing === 'new') {
        const initialAmount = v.initialYuan ? yuanToFen(v.initialYuan) : undefined
        await createMember({ phone: v.phone.trim(), name: v.name.trim(), password: v.password!, initialAmount })
        message.success(initialAmount ? `已开户并充值 ¥${formatYuan(initialAmount)}` : '已开户')
      } else if (editing) {
        const password = v.password || undefined
        await updateMember(editing.id, { name: v.name.trim(), password })
        message.success(password ? '已保存，该会员需用新密码重新登录' : '已保存')
      }
      setEditing(null)
      void load()
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示；保持弹窗让用户修改
    } finally {
      setSaving(false)
    }
  }

  const doRecharge = async () => {
    const v = await rechargeForm.validateFields().catch(() => null)
    if (!v || !recharging) return
    setSaving(true)
    try {
      const updated = await rechargeMember(recharging.id, { amount: yuanToFen(v.yuan), remark: v.remark?.trim() || undefined })
      message.success(`已为 ${updated.name} 充值 ¥${v.yuan.toFixed(2)}，当前余额 ¥${formatYuan(updated.balance)}`)
      setRecharging(null)
      void load()
    } catch (e) {
      ignoreShownError(e)
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (m: MemberItem, enabled: boolean) => {
    try {
      await setMemberEnabled(m.id, enabled)
      message.success(enabled ? '已启用' : '已停用，该会员不能再登录与下单')
      void load()
    } catch (e) {
      ignoreShownError(e)
    }
  }

  const columns: ColumnsType<MemberItem> = [
    { title: '姓名', dataIndex: 'name', render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    { title: '手机号（登录账号）', dataIndex: 'phone', width: 150 },
    {
      title: '余额',
      dataIndex: 'balance',
      width: 120,
      align: 'right',
      render: (v: number) => <Typography.Text strong type={v <= 0 ? 'secondary' : undefined}>¥{formatYuan(v)}</Typography.Text>,
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 100,
      render: (v: boolean, r) =>
        isOwner ? (
          <Popconfirm
            title={v ? '停用该会员？' : '启用该会员？'}
            description={v ? '停用后不能登录与下单，余额保留。' : undefined}
            onConfirm={() => toggle(r, !v)}
          >
            <Switch checked={v} checkedChildren="启用" unCheckedChildren="停用" />
          </Popconfirm>
        ) : v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>,
    },
    { title: '开户时间', dataIndex: 'createdAt', width: 150, render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作',
      width: 200,
      render: (_, r) => (
        <Space size={0}>
          {isOwner && (
            <Button type="link" size="small" icon={<WalletOutlined />} disabled={!r.enabled} onClick={() => { rechargeForm.resetFields(); setRecharging(r) }}>充值</Button>
          )}
          <Button type="link" size="small" onClick={() => setTxnMember(r)}>流水</Button>
          {isOwner && <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>}
        </Space>
      ),
    },
  ]

  const isNew = editing === 'new'

  return (
    <Card
      title="会员充值"
      extra={
        <Space wrap>
          <Input.Search
            allowClear
            placeholder="手机号 / 姓名"
            style={{ width: 220 }}
            onSearch={(v) => { setKeyword(v.trim()); setPage(1) }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
          {isOwner && <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit('new')}>开户</Button>}
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">
        顾客用手机号 + 密码登录 H5 点餐页；下单时直接从账户余额扣费，不经过微信 / 支付宝。
        余额由店主在这里充值（线下收款后登记），取消订单或退款会自动返还到余额。
      </Typography.Paragraph>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data.list}
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total: data.total, showSizeChanger: false, onChange: setPage, showTotal: (t) => `共 ${t} 位会员` }}
      />

      <Modal
        title={isNew ? '会员开户' : '编辑会员'}
        open={editing !== null}
        onOk={save}
        onCancel={() => setEditing(null)}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item
            name="phone"
            label="手机号（登录账号）"
            rules={isNew ? [{ required: true, pattern: /^1\d{10}$/, message: '请输入 11 位手机号' }] : []}
          >
            <Input disabled={!isNew} maxLength={11} placeholder="11 位手机号" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, max: 32, whitespace: true, message: '请输入姓名（最多 32 字）' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label={isNew ? '初始密码' : '重置密码'}
            extra={isNew ? '请告知顾客；顾客登录后可自行修改' : '留空则不修改；填写后该会员需用新密码重新登录'}
            rules={[{ required: isNew, min: 6, max: 64, message: '密码长度 6~64 位' }, { pattern: /^\S*$/, message: '密码不能包含空格' }]}
          >
            <Input.Password placeholder={isNew ? '6~64 位' : '留空不修改'} />
          </Form.Item>
          {isNew && (
            <Form.Item name="initialYuan" label="开户充值（元，可选）" extra="线下收款后在这里登记，顾客即可开始点餐">
              <InputNumber min={0} max={1000000} precision={2} style={{ width: '100%' }} prefix="¥" placeholder="0.00" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={recharging ? `为 ${recharging.name}（${recharging.phone}）充值` : '充值'}
        open={recharging !== null}
        onOk={doRecharge}
        okText="确认充值"
        onCancel={() => setRecharging(null)}
        confirmLoading={saving}
        destroyOnHidden
      >
        {recharging && (
          <Typography.Paragraph>当前余额 <Typography.Text strong>¥{formatYuan(recharging.balance)}</Typography.Text></Typography.Paragraph>
        )}
        <Form form={rechargeForm} layout="vertical" autoComplete="off">
          <Form.Item name="yuan" label="充值金额（元）" rules={[{ required: true, type: 'number', min: 0.01, max: 1000000, message: '请输入 0.01 ~ 1000000 之间的金额' }]}>
            <InputNumber min={0.01} max={1000000} precision={2} style={{ width: '100%' }} prefix="¥" autoFocus />
          </Form.Item>
          <Form.Item name="remark" label="备注（可选）" extra="如：现金 / 转账，便于日后核对">
            <Input maxLength={100} />
          </Form.Item>
          <Typography.Text type="secondary">充值只登记余额，不会向顾客收款；请先线下收款再操作。</Typography.Text>
        </Form>
      </Modal>

      <TransactionsDrawer member={txnMember} onClose={() => setTxnMember(null)} />
    </Card>
  )
}

/** 会员流水抽屉：充值 / 消费 / 退款返还，按时间倒序 */
function TransactionsDrawer({ member, onClose }: { member: MemberItem | null; onClose: () => void }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ list: WalletTransaction[]; total: number }>({ list: [], total: 0 })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setPage(1)
  }, [member?.id])

  useEffect(() => {
    if (!member) return
    let cancelled = false
    setLoading(true)
    listMemberTransactions(member.id, { page, pageSize: PAGE_SIZE })
      .then((res) => { if (!cancelled) setData(res) })
      .catch(ignoreShownError)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [member, page])

  const columns: ColumnsType<WalletTransaction> = [
    { title: '时间', dataIndex: 'createdAt', width: 150, render: (v: string) => dayjs(v).format('MM-DD HH:mm:ss') },
    { title: '类型', dataIndex: 'type', width: 100, render: (v: WalletTransaction['type']) => <Tag color={TXN_TYPE[v].color}>{TXN_TYPE[v].label}</Tag> },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 110,
      align: 'right',
      render: (v: number, r) => <Typography.Text type={r.credit ? 'success' : undefined}>{r.credit ? '+' : '-'}{fenToYuan(v).toFixed(2)}</Typography.Text>,
    },
    { title: '变动后余额', dataIndex: 'balanceAfter', width: 110, align: 'right', render: (v: number) => formatYuan(v) },
    {
      title: '说明',
      render: (_, r) => r.remark || (r.outTradeNo ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>订单 {r.outTradeNo}</Typography.Text> : '-'),
    },
  ]

  return (
    <Drawer title={member ? `${member.name} 的余额流水` : '余额流水'} open={member !== null} onClose={onClose} width={640}>
      {member && <Typography.Paragraph>当前余额 <Typography.Text strong>¥{formatYuan(member.balance)}</Typography.Text></Typography.Paragraph>}
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={data.list}
        loading={loading}
        pagination={{ current: page, pageSize: PAGE_SIZE, total: data.total, showSizeChanger: false, onChange: setPage }}
      />
    </Drawer>
  )
}
