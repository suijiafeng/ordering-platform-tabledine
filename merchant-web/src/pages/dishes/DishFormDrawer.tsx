import { useEffect, useState } from 'react'
import { App, Button, Card, Checkbox, Col, Drawer, Form, Input, InputNumber, Row, Select, Space, Spin, Switch, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { createDish, getDish, updateDish } from '../../api/menu'
import type { Category, DishSaveRequest } from '../../api/types'
import ImageUpload from '../../components/ImageUpload'
import { fenToYuan, yuanToFen } from '../../utils/money'

interface SpecItemForm { name: string; priceDeltaYuan: number; isDefault: boolean }
interface SpecGroupForm { name: string; required: boolean; items: SpecItemForm[] }
interface AddonItemForm { name: string; priceDeltaYuan: number }
interface AddonGroupForm { name: string; maxCount: number; items: AddonItemForm[] }

interface FormValues {
  categoryId: number
  name: string
  description?: string
  priceYuan: number
  image?: string | null
  onShelf: boolean
  specGroups: SpecGroupForm[]
  addonGroups: AddonGroupForm[]
}

interface Props {
  open: boolean
  /** 为空表示新建 */
  dishId: number | null
  categories: Category[]
  defaultCategoryId: number | null
  onClose: () => void
  onSaved: () => void
}

/** 菜品新建 / 编辑：基础信息 + 规格组（单选）+ 加料组（多选），界面金额单位为元 */
export default function DishFormDrawer({ open, dishId, categories, defaultCategoryId, onClose, onSaved }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    form.resetFields()
    if (!dishId) {
      form.setFieldsValue({
        categoryId: defaultCategoryId ?? categories[0]?.id,
        onShelf: true,
        specGroups: [],
        addonGroups: [],
      })
      return
    }
    setLoading(true)
    getDish(dishId)
      .then((d) => {
        form.setFieldsValue({
          categoryId: d.dish.categoryId,
          name: d.dish.name,
          description: d.dish.description ?? undefined,
          priceYuan: fenToYuan(d.dish.price),
          image: d.dish.image,
          onShelf: d.dish.status === 1,
          specGroups: d.specGroups.map((g) => ({
            name: g.name,
            required: g.required,
            items: g.items.map((i) => ({ name: i.name, priceDeltaYuan: fenToYuan(i.priceDelta), isDefault: i.isDefault })),
          })),
          addonGroups: d.addonGroups.map((g) => ({
            name: g.name,
            maxCount: g.maxCount,
            items: g.items.map((i) => ({ name: i.name, priceDeltaYuan: fenToYuan(i.priceDelta) })),
          })),
        })
      })
<<<<<<< HEAD
<<<<<<< HEAD
      .catch(() => onClose())
=======
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
      .catch(() => onClose())
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
      .finally(() => setLoading(false))
  }, [open, dishId, defaultCategoryId, categories, form])

  const submit = async () => {
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
    // 校验不通过时 antd 会 reject 一个字段错误对象，不是异常，直接返回即可
    const v = await form.validateFields().catch(() => null)
    if (!v) {
      return
    }
<<<<<<< HEAD
=======
    const v = await form.validateFields()
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
    const body: DishSaveRequest = {
      categoryId: v.categoryId,
      name: v.name.trim(),
      description: v.description?.trim() || null,
      price: yuanToFen(v.priceYuan),
      image: v.image || null,
      status: v.onShelf ? 1 : 0,
      specGroups: (v.specGroups ?? []).map((g) => ({
        name: g.name.trim(),
        required: g.required ?? true,
        items: (g.items ?? []).map((i) => ({
          name: i.name.trim(),
          priceDelta: yuanToFen(i.priceDeltaYuan),
          isDefault: !!i.isDefault,
        })),
      })),
      addonGroups: (v.addonGroups ?? []).map((g) => ({
        name: g.name.trim(),
        maxCount: g.maxCount ?? 1,
        items: (g.items ?? []).map((i) => ({ name: i.name.trim(), priceDelta: yuanToFen(i.priceDeltaYuan) })),
      })),
    }
    setSaving(true)
    try {
      if (dishId) {
        await updateDish(dishId, body)
      } else {
        await createDish(body)
      }
      message.success('已保存')
      onSaved()
<<<<<<< HEAD
<<<<<<< HEAD
    } catch {
      // 保持抽屉打开供用户修改；错误提示已由 request 统一弹出
=======
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
    } catch {
      // 保持抽屉打开供用户修改；错误提示已由 request 统一弹出
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      title={dishId ? '编辑菜品' : '新建菜品'}
      width={720}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={submit}>保存</Button>
        </Space>
      }
    >
      <Spin spinning={loading}>
        <Form<FormValues> form={form} layout="vertical" requiredMark="optional">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="菜品名称" rules={[{ required: true, whitespace: true, message: '请输入菜品名称' }]}>
                <Input maxLength={64} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="categoryId" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
                <Select options={categories.map((c) => ({ value: c.id, label: c.name }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="priceYuan" label="基础价（元）" rules={[{ required: true, message: '请输入价格' }]}>
                <InputNumber min={0} max={100000} precision={2} style={{ width: '100%' }} prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="onShelf" label="上架" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="description" label="描述">
                <Input.TextArea maxLength={255} showCount autoSize={{ minRows: 2, maxRows: 4 }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="image" label="图片">
                <ImageUpload />
              </Form.Item>
            </Col>
          </Row>

          <Typography.Title level={5}>规格（每组单选，按规格加价）</Typography.Title>
          <Form.List name="specGroups">
            {(groups, { add, remove }) => (
              <>
                {groups.map((g) => (
                  <Card
                    key={g.key}
                    size="small"
                    style={{ marginBottom: 12 }}
                    title={
                      <Space>
                        <Form.Item name={[g.name, 'name']} noStyle rules={[{ required: true, whitespace: true, message: '请输入规格组名称' }]}>
                          <Input placeholder="规格组名称，如：杯型" maxLength={32} style={{ width: 200 }} />
                        </Form.Item>
                        <Form.Item name={[g.name, 'required']} noStyle valuePropName="checked" initialValue={true}>
                          <Checkbox>必选</Checkbox>
                        </Form.Item>
                      </Space>
                    }
                    extra={<Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(g.name)} />}
                  >
                    <Form.List
                      name={[g.name, 'items']}
                      initialValue={[{ name: '', priceDeltaYuan: 0, isDefault: true }]}
                      rules={[{
                        validator: async (_, items: SpecItemForm[] | undefined) => {
                          if (!items || items.length === 0) throw new Error('至少一个规格项')
                          if (items.filter((i) => i?.isDefault).length > 1) throw new Error('只能有一个默认项')
                        },
                      }]}
                    >
                      {(items, itemOps, { errors }) => (
                        <>
                          {items.map((it) => (
                            <Space key={it.key} align="baseline" style={{ display: 'flex' }}>
                              <Form.Item name={[it.name, 'name']} rules={[{ required: true, whitespace: true, message: '请输入名称' }]}>
                                <Input placeholder="如：大杯" maxLength={32} />
                              </Form.Item>
                              <Form.Item name={[it.name, 'priceDeltaYuan']} initialValue={0}>
                                <InputNumber precision={2} min={-100000} max={100000} prefix="加价" style={{ width: 180 }} />
                              </Form.Item>
                              <Form.Item name={[it.name, 'isDefault']} valuePropName="checked">
                                <Checkbox>默认</Checkbox>
                              </Form.Item>
                              <Button type="text" icon={<DeleteOutlined />} onClick={() => itemOps.remove(it.name)} />
                            </Space>
                          ))}
                          <Form.ErrorList errors={errors} />
                          <Button type="dashed" icon={<PlusOutlined />} onClick={() => itemOps.add({ name: '', priceDeltaYuan: 0, isDefault: false })}>
                            添加规格项
                          </Button>
                        </>
                      )}
                    </Form.List>
                  </Card>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ name: '', required: true })} style={{ marginBottom: 24 }}>
                  添加规格组
                </Button>
              </>
            )}
          </Form.List>

          <Typography.Title level={5}>加料（可多选，按项加价）</Typography.Title>
          <Form.List name="addonGroups">
            {(groups, { add, remove }) => (
              <>
                {groups.map((g) => (
                  <Card
                    key={g.key}
                    size="small"
                    style={{ marginBottom: 12 }}
                    title={
                      <Space>
                        <Form.Item name={[g.name, 'name']} noStyle rules={[{ required: true, whitespace: true, message: '请输入加料组名称' }]}>
                          <Input placeholder="加料组名称，如：小料" maxLength={32} style={{ width: 200 }} />
                        </Form.Item>
                        <Form.Item name={[g.name, 'maxCount']} noStyle initialValue={1}>
                          <InputNumber min={1} max={30} prefix="最多选" style={{ width: 150 }} />
                        </Form.Item>
                      </Space>
                    }
                    extra={<Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(g.name)} />}
                  >
                    <Form.List
                      name={[g.name, 'items']}
                      initialValue={[{ name: '', priceDeltaYuan: 0 }]}
                      rules={[{
                        validator: async (_, items: AddonItemForm[] | undefined) => {
                          if (!items || items.length === 0) throw new Error('至少一个加料项')
                          const max = form.getFieldValue(['addonGroups', g.name, 'maxCount']) ?? 1
                          if (max > items.length) throw new Error('最多可选数量不能超过加料项数量')
                        },
                      }]}
                    >
                      {(items, itemOps, { errors }) => (
                        <>
                          {items.map((it) => (
                            <Space key={it.key} align="baseline" style={{ display: 'flex' }}>
                              <Form.Item name={[it.name, 'name']} rules={[{ required: true, whitespace: true, message: '请输入名称' }]}>
                                <Input placeholder="如：珍珠" maxLength={32} />
                              </Form.Item>
                              <Form.Item name={[it.name, 'priceDeltaYuan']} initialValue={0}>
                                <InputNumber precision={2} min={0} max={100000} prefix="加价" style={{ width: 180 }} />
                              </Form.Item>
                              <Button type="text" icon={<DeleteOutlined />} onClick={() => itemOps.remove(it.name)} />
                            </Space>
                          ))}
                          <Form.ErrorList errors={errors} />
                          <Button type="dashed" icon={<PlusOutlined />} onClick={() => itemOps.add({ name: '', priceDeltaYuan: 0 })}>
                            添加加料项
                          </Button>
                        </>
                      )}
                    </Form.List>
                  </Card>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ name: '', maxCount: 1 })}>
                  添加加料组
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Spin>
    </Drawer>
  )
}
