import { useCallback, useEffect, useState } from 'react'
import { App, Button, Card, Col, Image, Input, InputNumber, Popconfirm, Row, Space, Switch, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import { deleteDish, listCategories, listDishes, setDishSoldOut, setDishStatus, setDishStock } from '../../api/menu'
import type { Category, DishItem } from '../../api/types'
import { formatYuan } from '../../utils/money'
import { useIsOwner } from '../../utils/auth'
import CategoryPanel from './CategoryPanel'
import DishFormDrawer from './DishFormDrawer'

const PAGE_SIZE = 20

/** 菜品管理：左侧分类，右侧菜品列表。店员只能沽清 / 恢复 */
export default function DishesPage() {
  const { message } = App.useApp()
  const isOwner = useIsOwner()
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ list: DishItem[]; total: number }>({ list: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [drawer, setDrawer] = useState<{ open: boolean; dishId: number | null }>({ open: false, dishId: null })

  const loadCategories = useCallback(() => listCategories().then(setCategories), [])

  const loadDishes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listDishes({ categoryId: categoryId ?? undefined, keyword: keyword || undefined, page, pageSize: PAGE_SIZE })
      setData({ list: res.list, total: res.total })
    } finally {
      setLoading(false)
    }
  }, [categoryId, keyword, page])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  useEffect(() => {
    loadDishes()
  }, [loadDishes])

  const categoryName = (id: number) => categories.find((c) => c.id === id)?.name ?? '-'

  const patchLocal = (id: number, patch: Partial<DishItem>) =>
    setData((d) => ({ ...d, list: d.list.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))

  const columns: ColumnsType<DishItem> = [
    {
      title: '图片',
      dataIndex: 'image',
      width: 72,
      render: (src: string | null) =>
        src ? <Image src={src} width={48} height={48} style={{ objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ width: 48, height: 48, background: '#f5f5f5', borderRadius: 6 }} />,
    },
    {
      title: '名称',
      dataIndex: 'name',
      render: (name: string, r) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{name}</Typography.Text>
          {categoryId === null && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{categoryName(r.categoryId)}</Typography.Text>}
        </Space>
      ),
    },
    { title: '基础价', dataIndex: 'price', width: 100, render: (v: number) => formatYuan(v) },
    {
      title: '上架',
      dataIndex: 'status',
      width: 80,
      render: (v: number, r) =>
        isOwner ? (
          <Switch
            checked={v === 1}
            onChange={async (checked) => {
              await setDishStatus(r.id, checked ? 1 : 0)
              patchLocal(r.id, { status: checked ? 1 : 0 })
            }}
          />
        ) : v === 1 ? <Tag color="green">上架</Tag> : <Tag>下架</Tag>,
    },
    {
      title: '沽清',
      dataIndex: 'soldOut',
      width: 80,
      render: (v: boolean, r) => (
        <Switch
          checked={v}
          checkedChildren="售罄"
          onChange={async (checked) => {
            await setDishSoldOut(r.id, checked)
            patchLocal(r.id, { soldOut: checked })
            message.success(checked ? '已沽清' : '已恢复售卖')
          }}
        />
      ),
    },
    {
      title: '今日限量',
      dataIndex: 'stockQuantity',
      width: 140,
      render: (v: number | null, r) =>
        isOwner ? (
          <InputNumber
            key={`${r.id}-${v ?? 'none'}`}
            size="small"
            min={0}
            max={100000}
            placeholder="不限"
            defaultValue={v ?? undefined}
            style={{ width: 100 }}
            onBlur={async (e) => {
              const raw = e.target.value.trim()
              const next = raw === '' ? null : Number(raw)
              if (next !== v && (next === null || Number.isInteger(next))) {
                await setDishStock(r.id, next)
                patchLocal(r.id, { stockQuantity: next })
              }
            }}
          />
        ) : (v ?? '不限'),
    },
    ...(isOwner
      ? [{
          title: '操作',
          width: 120,
          render: (_: unknown, r: DishItem) => (
            <Space>
              <Button type="link" size="small" onClick={() => setDrawer({ open: true, dishId: r.id })}>编辑</Button>
              <Popconfirm title={`删除「${r.name}」？`} okButtonProps={{ danger: true }} onConfirm={async () => { await deleteDish(r.id); loadDishes() }}>
                <Button type="link" size="small" danger>删除</Button>
              </Popconfirm>
            </Space>
          ),
        }]
      : []),
  ]

  return (
    <Row gutter={16}>
      <Col xs={24} md={7} lg={6}>
        <CategoryPanel
          categories={categories}
          selectedId={categoryId}
          isOwner={isOwner}
          onSelect={(id) => { setCategoryId(id); setPage(1) }}
          onChanged={loadCategories}
        />
      </Col>
      <Col xs={24} md={17} lg={18}>
        <Card
          title={categoryId === null ? '全部菜品' : categoryName(categoryId)}
          extra={
            <Space>
              <Input.Search allowClear placeholder="搜索菜品" onSearch={(v) => { setKeyword(v.trim()); setPage(1) }} style={{ width: 200 }} />
              {isOwner && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  disabled={categories.length === 0}
                  title={categories.length === 0 ? '请先新建分类' : undefined}
                  onClick={() => setDrawer({ open: true, dishId: null })}
                >
                  新建菜品
                </Button>
              )}
            </Space>
          }
        >
          <Table<DishItem>
            rowKey="id"
            size="middle"
            loading={loading}
            columns={columns}
            dataSource={data.list}
            pagination={{ current: page, pageSize: PAGE_SIZE, total: data.total, onChange: setPage, showTotal: (t) => `共 ${t} 个` }}
          />
        </Card>
      </Col>
      <DishFormDrawer
        open={drawer.open}
        dishId={drawer.dishId}
        categories={categories}
        defaultCategoryId={categoryId}
        onClose={() => setDrawer({ open: false, dishId: null })}
        onSaved={() => { setDrawer({ open: false, dishId: null }); loadDishes() }}
      />
    </Row>
  )
}
