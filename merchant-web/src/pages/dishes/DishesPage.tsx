import { useCallback, useEffect, useState } from 'react'
import { App, Button, Col, Image, Input, InputNumber, Popconfirm, Row, Space, Switch, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import { deleteDish, listCategories, listDishes, setDishSoldOut, setDishStatus, setDishStock } from '../../api/menu'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import type { Category, DishItem } from '../../api/types'
import { formatYuan } from '../../utils/money'
import { useIsKitchen, useIsOwner } from '../../utils/auth'
import CategoryPanel from './CategoryPanel'
import DishFormDrawer from './DishFormDrawer'
import { ignoreShownError } from '../../utils/errors'
import Panel, { PageToolbar } from '../../components/Panel'

const PAGE_SIZE = 20

/** 菜品管理：左侧分类，右侧菜品列表。前厅只能沽清 / 恢复；后厨只能查看 */
export default function DishesPage() {
  const { message, modal } = App.useApp()
  const isOwner = useIsOwner()
  // 后厨只读：沽清也由前厅 / 店主操作（后端同样会拒绝）
  const canSoldOut = !useIsKitchen()
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ list: DishItem[]; total: number }>({ list: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [drawer, setDrawer] = useState<{ open: boolean; dishId: number | null }>({ open: false, dishId: null })

  // 错误提示均由 request 统一弹出，这里吞掉 rejection 避免 Unhandled promise rejection
  const loadCategories = useCallback(() => listCategories().then(setCategories).catch(() => {}), [])

  const beginLoad = useLatestRequest()
  // 限量输入框是非受控的：保存失败时递增该值强制重建，让显示值回到服务端的旧值
  const [stockReset, setStockReset] = useState(0)
  // 正在请求中的开关（`status-{id}` / `soldout-{id}`），显示 loading 并防止重复点击
  const [switching, setSwitching] = useState<string | null>(null)

  const loadDishes = useCallback(async () => {
    const isLatest = beginLoad()
    setLoading(true)
    try {
      const res = await listDishes({ categoryId: categoryId ?? undefined, keyword: keyword || undefined, page, pageSize: PAGE_SIZE })
      if (!isLatest()) return
      setData({ list: res.list, total: res.total })
      // 删除当前页最后一条后页码越界：回退到最后一页
      const lastPage = Math.max(1, Math.ceil(res.total / PAGE_SIZE))
      if (page > lastPage) {
        setPage(lastPage)
      }
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    } finally {
      if (isLatest()) setLoading(false)
    }
  }, [categoryId, keyword, page, beginLoad])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  useEffect(() => {
    void loadDishes()
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
        src ? <Image src={src} width={48} height={48} style={{ objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ width: 48, height: 48, background: 'rgba(128,128,128,0.12)', borderRadius: 6 }} />,
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
            loading={switching === `status-${r.id}`}
            onChange={async (checked) => {
              // 上下架立即影响顾客菜单：二次确认
              const ok = await modal.confirm({
                title: checked ? `上架「${r.name}」？` : `下架「${r.name}」？`,
                content: checked ? '顾客菜单会立即显示这道菜。' : '顾客菜单会立即不再显示这道菜，已加入购物车的需要重新选择。',
                okText: checked ? '上架' : '下架',
                okButtonProps: { danger: !checked },
              })
              if (!ok) return
              setSwitching(`status-${r.id}`)
              try {
                await setDishStatus(r.id, checked ? 1 : 0)
                patchLocal(r.id, { status: checked ? 1 : 0 })
              } catch (e) {
                ignoreShownError(e)  // 请求层已提示；开关保持原值
              } finally {
                setSwitching(null)
              }
            }}
          />
        ) : v === 1 ? <Tag color="green">上架</Tag> : <Tag>下架</Tag>,
    },
    {
      title: '沽清',
      dataIndex: 'soldOut',
      width: 80,
      render: (v: boolean, r) => (!canSoldOut ? (v ? <Tag color="red">售罄</Tag> : <Tag>在售</Tag>) : (
        <Switch
          checked={v}
          checkedChildren="售罄"
          loading={switching === `soldout-${r.id}`}
          onChange={async (checked) => {
            const ok = await modal.confirm({
              title: checked ? `沽清「${r.name}」？` : `恢复售卖「${r.name}」？`,
              content: checked ? '顾客将无法再点这道菜，直到恢复售卖。' : '顾客可以重新点这道菜。',
              okText: checked ? '沽清' : '恢复售卖',
              okButtonProps: { danger: checked },
            })
            if (!ok) return
            setSwitching(`soldout-${r.id}`)
            try {
              await setDishSoldOut(r.id, checked)
              patchLocal(r.id, { soldOut: checked })
              message.success(checked ? '已沽清' : '已恢复售卖')
            } catch (e) {
              ignoreShownError(e)  // 请求层已提示；开关保持原值
            } finally {
              setSwitching(null)
            }
          }}
        />
      )),
    },
    {
      title: '每日限量',
      dataIndex: 'dailyStock',
      width: 150,
      render: (v: number | null, r) => {
        // 输入框是店主设置的每日限量；下方是今日剩余（下单扣减，每天 0 点重置）
        const remaining = v != null ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>今日剩余 {r.stockQuantity ?? 0}</Typography.Text> : null
        if (!isOwner) {
          return v == null ? '不限' : <Space direction="vertical" size={0}><span>{v}</span>{remaining}</Space>
        }
        return (
          <Space direction="vertical" size={0}>
            <InputNumber
              key={`${r.id}-${v ?? 'none'}-${stockReset}`}
              size="small"
              min={0}
              max={100000}
              precision={0}
              placeholder="不限"
              defaultValue={v ?? undefined}
              style={{ width: 100 }}
              onBlur={async (e) => {
                const raw = e.target.value.trim()
                const next = raw === '' ? null : Number(raw)
                if (next !== v && (next === null || Number.isInteger(next))) {
                  // 失焦即保存容易误改：先确认，取消则恢复原值
                  const ok = await modal.confirm({
                    title: `将「${r.name}」每日限量改为 ${next === null ? '不限' : `${next} 份`}？`,
                    content: '立即生效，今日剩余会按新限量重新计算。',
                    okText: '确认修改',
                  })
                  if (!ok) {
                    setStockReset((t) => t + 1)
                    return
                  }
                  try {
                    await setDishStock(r.id, next)
                    // 今日剩余由后端按「新限量 − 今日已售」重算，重新加载才能显示正确的值
                    void loadDishes()
                  } catch (e) {
                    setStockReset((t) => t + 1)  // 回滚显示值
                    ignoreShownError(e)  // 请求层已提示
                  }
                }
              }}
            />
            {remaining}
          </Space>
        )
      },
    },
    ...(isOwner
      ? [{
          title: '操作',
          width: 120,
          render: (_: unknown, r: DishItem) => (
            <Space>
              <Button type="link" size="small" onClick={() => setDrawer({ open: true, dishId: r.id })}>编辑</Button>
              <Popconfirm title={`删除「${r.name}」？`} okButtonProps={{ danger: true }} onConfirm={async () => {
                try {
                  await deleteDish(r.id)
                  void loadDishes()
                } catch (e) {
                  ignoreShownError(e)  // 请求层已提示（如菜品仍在使用）
                }
              }}>
                <Button type="link" size="small" danger>删除</Button>
              </Popconfirm>
            </Space>
          ),
        }]
      : []),
  ]

  return (
    <Row gutter={[24, 16]}>
      <Col xs={24} lg={7} xl={6}>
        <CategoryPanel
          categories={categories}
          selectedId={categoryId}
          isOwner={isOwner}
          onSelect={(id) => { setCategoryId(id); setPage(1) }}
          onChanged={loadCategories}
        />
      </Col>
      <Col xs={24} lg={17} xl={18}>
        <PageToolbar>
          {isOwner && (
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              disabled={categories.length === 0}
              title={categories.length === 0 ? '请先新建分类' : undefined}
              onClick={() => setDrawer({ open: true, dishId: null })}
            >
              新建菜品
            </Button>
          )}
          <Input.Search size="large" allowClear placeholder="搜索菜品" onSearch={(v) => { setKeyword(v.trim()); setPage(1) }} style={{ width: 280, maxWidth: '100%' }} />
          <Typography.Text type="secondary" style={{ marginLeft: 'auto' }}>
            {categoryId === null ? '全部菜品' : categoryName(categoryId)}
          </Typography.Text>
        </PageToolbar>
        <Panel>
          <Table<DishItem>
            scroll={{ x: 'max-content' }}
            rowKey="id"
            size="middle"
            loading={loading}
            columns={columns}
            dataSource={data.list}
            pagination={{ current: page, pageSize: PAGE_SIZE, total: data.total, onChange: setPage, showTotal: (t) => `共 ${t} 个` }}
          />
        </Panel>
      </Col>
      <DishFormDrawer
        open={drawer.open}
        dishId={drawer.dishId}
        categories={categories}
        defaultCategoryId={categoryId}
        onClose={() => setDrawer({ open: false, dishId: null })}
        onSaved={() => { setDrawer({ open: false, dishId: null }); void loadDishes() }}
      />
    </Row>
  )
}
