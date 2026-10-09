import { useCallback, useEffect, useState, useRef } from 'react'
import { Alert, App, Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Space, Switch, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, WalletOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { createMember, getMember, listMemberTransactions, listMembers, rechargeMember, setMemberEnabled, updateMember } from '../../api/member'
import type { MemberItem, WalletTransaction } from '../../api/types'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import { useIsKitchen, useIsOwner } from '../../utils/auth'
import { ignoreShownError } from '../../utils/errors'
import { ApiError } from '../../utils/request'
import { fenToYuan, formatYuan, yuanToFen } from '../../utils/money'
import Panel, { PageToolbar } from '../../components/Panel'
import OperatorVerifyModal, { type VerifyResult } from '../../components/OperatorVerifyModal'

const PAGE_SIZE = 20

/** 身份复核弹窗的标题与确认按钮文字 */
const VERIFY_TEXT = { recharge: '确认充值', create: '确认开户并充值', resetPassword: '确认重置密码' } as const

type EditState = 'new' | MemberItem | null

const TXN_TYPE: Record<WalletTransaction['type'], { label: string; color: string }> = {
  RECHARGE: { label: '充值', color: 'green' },
  PAY: { label: '消费', color: 'orange' },
  REFUND: { label: '退款返还', color: 'blue' },
}

/**
 * 会员充值：会员账号由商家创建（手机号 + 密码），余额由商家充值，H5 下单直接从余额扣费。
 * 店主与前厅可查看会员与流水、开户、停用、充值（充值需复核操作人密码，全程审计）；重置会员密码仅店主（同样复核）；后厨无权访问。
 */
/** 与服务端一致的手机号脱敏：138****0001 */
function maskPhone(phone: string): string {
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone
}

function newRequestId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
}

export default function MembersPage() {
  const { message, modal } = App.useApp()
  /**
   * 充值请求号绑定「会员 + 金额」：同一笔充值（超时重试、双击）沿用同一个请求号，服务端只入账一次；
   * 改了金额就是另一笔充值，换新请求号（服务端也会拒绝同一请求号换金额）。
   */
  const rechargeRequest = useRef<{ memberId: number; amount: number; id: string } | null>(null)
  /**
   * 结果未知的充值（超时 / 断网：服务端可能已经入账）。关掉窗口再打开同一会员时沿用原金额和请求号，
   * 再次提交如果其实已入账，服务端会识别为重复而不会二次入账。
   */
  const [uncertain, setUncertain] = useState<{ memberId: number; amount: number; id: string; balanceBefore: number } | null>(null)
  // 会员管理：店主与前厅（后厨在路由层已拦截，这里再兜底一次）
  const canManage = !useIsKitchen()
  // 重置会员密码后即可登录该会员、动用余额：仅店主可操作
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
  /** 待复核身份的敏感操作：充值、开户时顺带首充、重置会员密码。确认页核对内容并输入当前登录密码后才提交 */
  const [pendingVerify, setPendingVerify] = useState<
    | { kind: 'recharge'; member: MemberItem; amount: number; remark?: string }
    | { kind: 'create'; phone: string; name: string; password: string; initialAmount: number }
    | { kind: 'resetPassword'; member: MemberItem; name: string; password: string }
    | null
  >(null)

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
        if (initialAmount) {
          // 开户顺带充值是资金操作：进入二次确认并复核操作人身份
          setPendingVerify({ kind: 'create', phone: v.phone.trim(), name: v.name.trim(), password: v.password!, initialAmount })
          return
        }
        await createMember({ phone: v.phone.trim(), name: v.name.trim(), password: v.password! })
        message.success('已开户')
      } else if (editing) {
        if (v.password) {
          // 重置密码：进入二次确认并复核操作人身份
          setPendingVerify({ kind: 'resetPassword', member: editing, name: v.name.trim(), password: v.password })
          return
        }
        await updateMember(editing.id, { name: v.name.trim() })
        message.success('已保存')
      }
      setEditing(null)
      void load()
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示；保持弹窗让用户修改
    } finally {
      setSaving(false)
    }
  }

  /** 充值第一步：填写金额 → 进入二次确认（核对 + 复核身份） */
  const doRecharge = async () => {
    const v = await rechargeForm.validateFields().catch(() => null)
    if (!v || !recharging) return
    setPendingVerify({ kind: 'recharge', member: recharging, amount: yuanToFen(v.yuan), remark: v.remark?.trim() || undefined })
  }

  /** 第二步：带上操作人密码真正提交充值 */
  const executeRecharge = async (member: MemberItem, amount: number, remark: string | undefined, operatorPassword: string): Promise<VerifyResult> => {
    if (!rechargeRequest.current || rechargeRequest.current.memberId !== member.id || rechargeRequest.current.amount !== amount) {
      rechargeRequest.current = { memberId: member.id, amount, id: newRequestId() }
    }
    const requestId = rechargeRequest.current.id
    setSaving(true)
    try {
      const updated = await rechargeMember(member.id, { amount, remark, requestId, operatorPassword }, { silent: true })
      // 服务端保证：同一请求号只按同一金额入账，所以这里的金额就是实际入账金额
      message.success(`已为 ${updated.name} 充值 ${formatYuan(amount)}，当前余额 ${formatYuan(updated.balance)}`)
      rechargeRequest.current = null
      setUncertain(null)
      setPendingVerify(null)
      setRecharging(null)
      void load()
      return 'ok'
    } catch (e) {
      if (e instanceof ApiError && e.code === 40302) return 'wrongPassword'  // 密码错误：留在确认页重输，不会入账
      setPendingVerify(null)
      if (e instanceof ApiError && e.code === -1) {
        // 超时 / 断网 / 网关错误：请求可能已经到达服务端并入账，不能当作「没充上」
        const balanceBefore = uncertain?.memberId === member.id ? uncertain.balanceBefore : member.balance
        setUncertain({ memberId: member.id, amount, id: requestId, balanceBefore })
        // 手机号已脱敏，按会员 ID 重新查余额
        const fresh = await getMember(member.id).catch(() => undefined)
        if (fresh) setRecharging(fresh)
        modal.warning({
          title: '充值结果未确认',
          content: fresh
            ? `网络异常，无法确认 ${formatYuan(amount)} 是否已入账。充值前余额 ${formatYuan(balanceBefore)}，当前余额 ${formatYuan(fresh.balance)}。请先查看流水确认；如未入账，可再次提交，不会重复入账。`
            : `网络异常，无法确认 ${formatYuan(amount)} 是否已入账。请恢复网络后查看该会员流水确认；如未入账，可再次提交，不会重复入账。`,
        })
      } else {
        // 其他失败（如「该笔充值已按其他金额入账」的冲突）
        message.error(e instanceof Error ? e.message : '充值失败')
        if (e instanceof ApiError && e.code === 40901) void load()
      }
      return 'error'
    } finally {
      setSaving(false)
    }
  }

  /** 开户 + 首充：带上操作人密码提交；密码错误时不会建号 */
  const executeCreate = async (p: { phone: string; name: string; password: string; initialAmount: number }, operatorPassword: string): Promise<VerifyResult> => {
    try {
      await createMember({ ...p, operatorPassword }, { silent: true })
      message.success(`已开户并充值 ${formatYuan(p.initialAmount)}`)
      setPendingVerify(null)
      setEditing(null)
      void load()
      return 'ok'
    } catch (e) {
      if (e instanceof ApiError && e.code === 40302) return 'wrongPassword'
      setPendingVerify(null)
      message.error(e instanceof Error ? e.message : '开户失败')
      return 'error'
    }
  }

  /** 重置会员密码（店主）：带上操作人密码提交；密码错误时不会修改 */
  const executeResetPassword = async (p: { member: MemberItem; name: string; password: string }, operatorPassword: string): Promise<VerifyResult> => {
    try {
      await updateMember(p.member.id, { name: p.name, password: p.password, operatorPassword }, { silent: true })
      message.success('已保存，该会员需用新密码重新登录')
      setPendingVerify(null)
      setEditing(null)
      void load()
      return 'ok'
    } catch (e) {
      if (e instanceof ApiError && e.code === 40302) return 'wrongPassword'
      setPendingVerify(null)
      message.error(e instanceof Error ? e.message : '重置密码失败')
      return 'error'
    }
  }

  const openRecharge = (r: MemberItem) => {
    rechargeForm.resetFields()
    // 同一会员有结果未知的充值：沿用原金额与请求号，避免关窗重开后换了请求号导致重复入账
    rechargeRequest.current = uncertain?.memberId === r.id ? { memberId: r.id, amount: uncertain.amount, id: uncertain.id } : null
    setRecharging(r)
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
    { title: '姓名', dataIndex: 'name', width: 100, render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    { title: '手机号（登录账号）', dataIndex: 'phone', width: 150 },
    {
      title: '余额',
      dataIndex: 'balance',
      width: 120,
      render: (v: number) => <Typography.Text strong type={v <= 0 ? 'secondary' : undefined}>{formatYuan(v)}</Typography.Text>,
    },
    { title: '开户时间', dataIndex: 'createdAt', width: 150, render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 100,
      render: (v: boolean, r) =>
        canManage ? (
          <Popconfirm
            title={v ? '停用该会员？' : '启用该会员？'}
            description={v ? '停用后不能登录与下单，余额保留。' : undefined}
            onConfirm={() => toggle(r, !v)}
          >
            <Switch checked={v} checkedChildren="启用" unCheckedChildren="停用" />
          </Popconfirm>
        ) : v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>,
    },
    {
      title: '操作',
      width: 150,
      render: (_, r) => (
        <Space size={0}>
          {canManage && (
            <Button type="link" size="small" icon={<WalletOutlined />} disabled={!r.enabled} onClick={() => openRecharge(r)}>充值</Button>
          )}
          <Button type="link" size="small" onClick={() => setTxnMember(r)}>流水</Button>
          {canManage && <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>}
        </Space>
      ),
    },
  ]

  const isNew = editing === 'new'

  return (
    <div>
      <PageToolbar extra={<Button size="large" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>}>
        {canManage && <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => openEdit('new')}>会员开户</Button>}
        <Input.Search
          size="large"
          allowClear
          placeholder="手机号 / 姓名"
          style={{ width: 300, maxWidth: '100%' }}
          onSearch={(v) => { setKeyword(v.trim()); setPage(1) }}
        />
      </PageToolbar>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
        顾客用手机号 + 密码登录 H5 点餐页；下单时直接从账户余额扣费，不经过微信 / 支付宝。
        余额由店主或前厅在这里充值（线下收款后登记），取消订单或退款会自动返还到余额。
      </Typography.Paragraph>
      <Panel>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data.list}
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{ current: page, pageSize: PAGE_SIZE, total: data.total, showSizeChanger: false, onChange: setPage, showTotal: (t) => `共 ${t} 位会员` }}
        />
      </Panel>

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
          {(isNew || isOwner) && <Form.Item
            name="password"
            label={isNew ? '初始密码' : '重置密码'}
            extra={isNew ? '请告知顾客；顾客登录后可自行修改' : '留空则不修改；填写后该会员需用新密码重新登录'}
            rules={[{ required: isNew, min: 6, max: 64, message: '密码长度 6~64 位' }, { pattern: /^\S*$/, message: '密码不能包含空格' }]}
          >
            <Input.Password placeholder={isNew ? '6~64 位' : '留空不修改'} />
          </Form.Item>}
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
        okText="下一步：确认充值"
        onCancel={() => setRecharging(null)}
        confirmLoading={saving}
        destroyOnHidden
      >
        {recharging && (
          <Typography.Paragraph>当前余额 <Typography.Text strong>{formatYuan(recharging.balance)}</Typography.Text></Typography.Paragraph>
        )}
        {recharging && uncertain?.memberId === recharging.id && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={`上一笔 ${formatYuan(uncertain.amount)} 的充值结果未确认`}
            description={`充值前余额 ${formatYuan(uncertain.balanceBefore)}。请先查看流水确认是否已入账；未入账可再次提交，不会重复入账。改动金额将视为一笔新的充值。`}
            action={<Button size="small" onClick={() => setTxnMember(recharging)}>查看流水</Button>}
          />
        )}
        <Form
          form={rechargeForm}
          layout="vertical"
          autoComplete="off"
          initialValues={recharging && uncertain?.memberId === recharging.id ? { yuan: uncertain.amount / 100 } : undefined}
        >
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
      <OperatorVerifyModal
        open={pendingVerify !== null}
        title={VERIFY_TEXT[pendingVerify?.kind ?? 'recharge']}
        okText={VERIFY_TEXT[pendingVerify?.kind ?? 'recharge']}
        warning={pendingVerify?.kind === 'resetPassword' ? '重置后立即生效，会员原密码失效，请核对无误后再确认。' : undefined}
        onCancel={() => setPendingVerify(null)}
        summary={pendingVerify && (
          <Descriptions column={1} size="small" bordered>
            {pendingVerify.kind === 'resetPassword' ? (
              <>
                <Descriptions.Item label="会员">{pendingVerify.member.name}（{pendingVerify.member.phone}）</Descriptions.Item>
                <Descriptions.Item label="当前余额">{formatYuan(pendingVerify.member.balance)}</Descriptions.Item>
                <Descriptions.Item label="说明">该会员会被立即退出登录，需要用新密码重新登录。请确认已通知会员本人。</Descriptions.Item>
              </>
            ) : pendingVerify.kind === 'recharge' ? (
              <>
                <Descriptions.Item label="会员">{pendingVerify.member.name}（{pendingVerify.member.phone}）</Descriptions.Item>
                <Descriptions.Item label="当前余额">{formatYuan(pendingVerify.member.balance)}</Descriptions.Item>
                <Descriptions.Item label="充值金额"><Typography.Text strong type="danger" style={{ fontSize: 22 }}>{formatYuan(pendingVerify.amount)}</Typography.Text></Descriptions.Item>
                <Descriptions.Item label="充值后余额">{formatYuan(pendingVerify.member.balance + pendingVerify.amount)}</Descriptions.Item>
                {pendingVerify.remark && <Descriptions.Item label="备注">{pendingVerify.remark}</Descriptions.Item>}
              </>
            ) : (
              <>
                <Descriptions.Item label="新会员">{pendingVerify.name}（{maskPhone(pendingVerify.phone)}）</Descriptions.Item>
                <Descriptions.Item label="开户充值"><Typography.Text strong type="danger" style={{ fontSize: 22 }}>{formatYuan(pendingVerify.initialAmount)}</Typography.Text></Descriptions.Item>
              </>
            )}
          </Descriptions>
        )}
        onConfirm={(pwd) => {
          if (!pendingVerify) return Promise.resolve<VerifyResult>('error')
          if (pendingVerify.kind === 'resetPassword') return executeResetPassword(pendingVerify, pwd)
          return pendingVerify.kind === 'recharge'
            ? executeRecharge(pendingVerify.member, pendingVerify.amount, pendingVerify.remark, pwd)
            : executeCreate(pendingVerify, pwd)
        }}
      />
    </div>
  )
}

/** 会员流水抽屉：充值 / 消费 / 退款返还，按时间倒序 */
function TransactionsDrawer({ member, onClose }: { member: MemberItem | null; onClose: () => void }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ list: WalletTransaction[]; total: number }>({ list: [], total: 0 })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setPage(1)
    setData({ list: [], total: 0 })  // 换会员时先清空，避免短暂显示上一位会员的流水
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
      {member && <Typography.Paragraph>当前余额 <Typography.Text strong>{formatYuan(member.balance)}</Typography.Text></Typography.Paragraph>}
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
