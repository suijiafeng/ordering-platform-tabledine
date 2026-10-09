import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Input, Modal, Typography } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { useAuthStore } from '../store/auth'

/** onConfirm 的结果：ok 关闭弹窗；wrongPassword 留在弹窗提示重输；error 关闭（其余错误由调用方处理） */
export type VerifyResult = 'ok' | 'wrongPassword' | 'error'

interface Props {
  open: boolean
  title: string
  /** 二次确认要核对的内容（会员、金额、充值后余额等） */
  summary: ReactNode
  okText: string
  /** 提交前的提醒，默认按资金操作提示 */
  warning?: string
  onCancel: () => void
  onConfirm: (operatorPassword: string) => Promise<VerifyResult>
}

/**
 * 资金类等敏感操作的二次确认：先核对操作内容，再输入当前登录账号的密码复核身份，服务端校验通过才执行。
 * 密码只放在本弹窗的状态里，关闭即清空，不进表单、不写本地存储。
 */
export default function OperatorVerifyModal({ open, title, summary, okText, warning = '资金操作提交后立即生效、无法撤销，请核对无误后再确认。', onCancel, onConfirm }: Props) {
  const me = useAuthStore((s) => s.staff)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setPassword('')
      setError(null)
    }
  }, [open])

  const submit = async () => {
    if (submitting) return
    if (!password) {
      setError('请输入当前登录密码')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await onConfirm(password)
      if (result === 'wrongPassword') {
        setPassword('')
        setError('登录密码不正确，请重新输入')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={submit}
      okText={okText}
      cancelText="返回修改"
      confirmLoading={submitting}
      maskClosable={false}
      destroyOnHidden
    >
      <div style={{ marginBottom: 16 }}>{summary}</div>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message={warning}
      />
      <Typography.Text strong>验证操作人身份</Typography.Text>
      <Typography.Paragraph type="secondary" style={{ margin: '4px 0 8px', fontSize: 13 }}>
        请输入当前登录账号{me ? `「${me.name}」` : ''}的密码
      </Typography.Paragraph>
      <Input.Password
        prefix={<LockOutlined />}
        value={password}
        autoFocus
        // 复核身份不应被浏览器自动填充，必须由操作人手动输入
        autoComplete="new-password"
        placeholder="当前登录密码"
        status={error ? 'error' : undefined}
        onChange={(e) => { setPassword(e.target.value); setError(null) }}
        onPressEnter={() => void submit()}
      />
      {error && <Typography.Text type="danger" style={{ display: 'block', marginTop: 6 }}>{error}</Typography.Text>}
    </Modal>
  )
}
