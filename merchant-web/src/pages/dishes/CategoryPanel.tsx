import { useState } from 'react'
import { App, Button, Card, Input, List, Modal, Space, Switch, Tag, Typography, theme as antdTheme } from 'antd'
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { createCategory, deleteCategory, sortCategories, updateCategory } from '../../api/menu'
import type { Category } from '../../api/types'
import { ignoreShownError } from '../../utils/errors'

/** 「全部菜品」占位项（List 需要非空的数据项） */
const ALL: Category = { id: -1, name: '全部菜品', sort: 0, status: 1 }

interface Props {
  categories: Category[]
  selectedId: number | null
  isOwner: boolean
  onSelect: (id: number | null) => void
  onChanged: () => void
}

export default function CategoryPanel({ categories, selectedId, isOwner, onSelect, onChanged }: Props) {
  const { message, modal } = App.useApp()
  const { token } = antdTheme.useToken()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [name, setName] = useState('')
  // 停用的分类在顾客端隐藏，其下菜品也不能下单；在修改弹窗里可重新启用
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  const openEdit = (c: Category | 'new') => {
    setEditing(c)
    setName(c === 'new' ? '' : c.name)
    setEnabled(c === 'new' || c.status !== 0)
  }

  const save = async () => {
    if (!name.trim()) {
      message.warning('请输入分类名称')
      return
    }
    // 停用分类会让其下所有菜品从顾客菜单消失：二次确认
    if (editing && editing !== 'new' && editing.status === 1 && !enabled) {
      const ok = await modal.confirm({
        title: `停用分类「${editing.name}」？`,
        content: '该分类及其下所有菜品会立即从顾客菜单中隐藏，顾客无法再点。',
        okText: '确认停用',
        okButtonProps: { danger: true },
      })
      if (!ok) return
    }
    setSaving(true)
    try {
      if (editing === 'new') {
        await createCategory(name.trim())
      } else if (editing) {
        await updateCategory(editing.id, { name: name.trim(), status: enabled ? 1 : 0 })
      }
      setEditing(null)
      onChanged()
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    } finally {
      setSaving(false)
    }
  }

  const move = async (index: number, delta: number) => {
    const ids = categories.map((c) => c.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) {
      return
    }
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    try {
      await sortCategories(ids)
      onChanged()
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示；列表保持原顺序
    }
  }

  const remove = (c: Category) => {
    modal.confirm({
      title: `删除分类「${c.name}」？`,
      content: '分类下还有菜品时不能删除。',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteCategory(c.id)
          if (selectedId === c.id) {
            onSelect(null)
          }
          onChanged()
        } catch (e) {
          ignoreShownError(e)  // 请求层已提示（如分类下还有菜品）
        }
      },
    })
  }

  return (
    <Card
      title="分类"
      extra={isOwner && <Button type="link" icon={<PlusOutlined />} onClick={() => openEdit('new')}>新建</Button>}
      styles={{ body: { padding: '6px 0' } }}
    >
      <style>{`
        /* 固定行高；操作按钮绝对定位浮在右侧，只切换透明度，不参与布局 —— 悬停 / 选中时列表不会抖动 */
        .cat-item { position: relative; height: 40px; }
        .cat-item:hover { background: ${token.colorFillTertiary}; }
        .cat-ops {
          position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
          display: flex; align-items: center; gap: 2px; padding-left: 20px;
          visibility: hidden; opacity: 0; transition: opacity .15s, visibility .15s;
          /* 左侧渐变遮住被覆盖的文字末尾；底层先铺不透明的容器色，半透明的悬停色叠上去后仍然不透字 */
          background:
            linear-gradient(to right, transparent, var(--cat-row-bg) 20px),
            linear-gradient(to right, transparent, ${token.colorBgContainer} 20px);
        }
        .cat-item:hover .cat-ops, .cat-item:focus-within .cat-ops, .cat-item.is-active .cat-ops { visibility: visible; opacity: 1; }
        .cat-ops .ant-btn { width: 24px; height: 24px; min-width: 24px; padding: 0; }
      `}</style>
      <List<Category>
        split={false}
        rowKey="id"
        dataSource={[ALL, ...categories]}
        renderItem={(item, i) => {
          const c = item.id === ALL.id ? null : item
          const active = (c?.id ?? null) === selectedId
          return (
            <List.Item
              className={active ? 'cat-item is-active' : 'cat-item'}
              onClick={() => onSelect(c?.id ?? null)}
              style={{
                cursor: 'pointer',
                margin: '2px 8px',
                padding: '0 8px 0 12px',
                borderRadius: 8,
                borderBlockEnd: 'none',
                background: active ? token.colorPrimaryBg : undefined,
                // 按钮条的遮罩底色与行背景一致
                ['--cat-row-bg' as string]: active ? token.colorPrimaryBg : token.colorFillTertiary,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 4, minWidth: 0 }}>
                <Typography.Text
                  strong={active}
                  ellipsis
                  // 选中项的按钮常显：给名称让出位置，避免被按钮盖住
                  style={{ flex: 1, minWidth: 0, color: active ? token.colorPrimaryText : undefined, paddingInlineEnd: active && c && isOwner ? 104 : 0 }}
                >
                  {c ? c.name : '全部菜品'}
                </Typography.Text>
                {c && c.status === 0 && <Tag style={{ marginInlineEnd: 0 }}>停用</Tag>}
              </div>
              {c && isOwner && (
                // 排序 / 编辑 / 删除：悬停、键盘聚焦或选中时出现
                <div className="cat-ops" onClick={(e) => e.stopPropagation()}>
                  <Button size="small" type="text" icon={<ArrowUpOutlined />} aria-label="上移" disabled={i === 1} onClick={() => move(i - 1, -1)} />
                  <Button size="small" type="text" icon={<ArrowDownOutlined />} aria-label="下移" disabled={i === categories.length} onClick={() => move(i - 1, 1)} />
                  <Button size="small" type="text" icon={<EditOutlined />} aria-label="修改分类" onClick={() => openEdit(c)} />
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="删除分类" onClick={() => remove(c)} />
                </div>
              )}
            </List.Item>
          )
        }}
      />
      <Modal
        title={editing === 'new' ? '新建分类' : '修改分类'}
        open={editing !== null}
        onOk={save}
        confirmLoading={saving}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Input value={name} maxLength={32} placeholder="分类名称，如：招牌热菜" onChange={(e) => setName(e.target.value)} onPressEnter={save} />
        {editing !== 'new' && (
          <Space style={{ marginTop: 16 }}>
            <Switch checked={enabled} onChange={setEnabled} />
            <Typography.Text>{enabled ? '启用：顾客端可见' : '停用：顾客端隐藏，其下菜品不能下单'}</Typography.Text>
          </Space>
        )}
      </Modal>
    </Card>
  )
}
