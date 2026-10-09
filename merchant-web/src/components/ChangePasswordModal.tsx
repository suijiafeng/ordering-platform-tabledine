import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Form, Input, Modal } from 'antd'
import { changeOwnPassword } from '../api/staff'
import { useAuthStore } from '../store/auth'
import { ignoreShownError } from '../utils/errors'

/** 修改密码弹窗：成功后服务端已使旧 token 失效，直接退出到登录页 */
export default function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ oldPassword: string; newPassword: string; confirm: string }>()

  const submit = async () => {
    const v = await form.validateFields().catch(() => null)
    if (!v) return
    setSaving(true)
    try {
      await changeOwnPassword(v.oldPassword, v.newPassword)
      message.success('密码已修改，请重新登录')
      onClose()
      logout()
      navigate('/login', { replace: true })
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="修改密码" open={open} onOk={submit} onCancel={onClose} confirmLoading={saving} destroyOnHidden>
      <Form form={form} layout="vertical" autoComplete="off" preserve={false}>
        <Form.Item name="oldPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
          <Input.Password />
        </Form.Item>
        <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6, max: 64, message: '密码长度 6~64 位' }]}>
          <Input.Password />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="确认新密码"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator: (_, v) => (v === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('两次输入不一致'))),
            }),
          ]}
        >
          <Input.Password />
        </Form.Item>
      </Form>
    </Modal>
  )
}
