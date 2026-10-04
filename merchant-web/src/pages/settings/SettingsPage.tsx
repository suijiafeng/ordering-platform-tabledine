import { useCallback, useEffect, useState } from 'react'
import { App, Button, Card, Col, Form, Input, InputNumber, Result, Row, Space, Spin, Switch, Typography } from 'antd'
import { fetchStore, setBusinessStatus, updateStore } from '../../api/store'
import type { StoreDetail, StoreUpdateRequest } from '../../api/types'
import ImageUpload from '../../components/ImageUpload'
import { ignoreShownError } from '../../utils/errors'

/** 店铺设置（店主）：营业状态、基本信息、业务参数 */
export default function SettingsPage() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<StoreUpdateRequest>()
  const [store, setStore] = useState<StoreDetail | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)

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
    if (!v) {
      return
    }
    setSaving(true)
    try {
      const s = await updateStore(v)
      setStore(s)
      form.setFieldsValue(s)
      message.success('已保存')
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

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space size="large">
          <Typography.Text strong>营业状态</Typography.Text>
          <Switch checked={store.businessStatus === 1} checkedChildren="营业中" unCheckedChildren="已打烊" onChange={toggleOpen} />
        </Space>
      </Card>
      <Card title="店铺信息与业务参数" extra={<Button type="primary" loading={saving} onClick={save}>保存</Button>}>
        <Form form={form} layout="vertical" style={{ maxWidth: 800 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="店铺名称" rules={[{ required: true, whitespace: true, message: '请输入店铺名称' }]}>
                <Input maxLength={64} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="phone" label="联系电话">
                <Input maxLength={20} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="address" label="地址">
                <Input maxLength={255} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="businessHours" label="营业时间" extra="仅展示用，如 10:00-22:00">
                <Input maxLength={64} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="logo" label="店铺 Logo">
                <ImageUpload />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Typography.Title level={5}>业务参数</Typography.Title>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="autoAccept" label="自动接单" valuePropName="checked" extra="开启后顾客支付成功即进入制作中">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="payTimeoutMin" label="未支付自动关单（分钟）" rules={[{ required: true }]}>
                <InputNumber min={5} max={60} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="acceptTimeoutMin" label="未接单自动退款（分钟）" rules={[{ required: true }]} extra="手动接单模式下生效">
                <InputNumber min={1} max={60} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="afterSaleHours" label="售后申请时限（小时）" rules={[{ required: true }]}>
                <InputNumber min={0} max={168} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>
    </Space>
  )
}
