import { useState } from 'react'
import { App, Button, Card, Input, List, Modal, Space, Tag, Typography, theme as antdTheme } from 'antd'
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
  const [saving, setSaving] = useState(false)

  const openEdit = (c: Category | 'new') => {
    setEditing(c)
    setName(c === 'new' ? '' : c.name)
  }

  const save = async () => {
    if (!name.trim()) {
      message.warning('请输入分类名称')
      return
    }
    setSaving(true)
    try {
      if (editing === 'new') {
        await createCategory(name.trim())
      } else if (editing) {
        await updateCategory(editing.id, { name: name.trim() })
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
    await sortCategories(ids)
    onChanged()
  }

  const remove = (c: Category) => {
    modal.confirm({
      title: `删除分类「${c.name}」？`,
      content: '分类下还有菜品时不能删除。',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteCategory(c.id)
        if (selectedId === c.id) {
          onSelect(null)
        }
        onChanged()
      },
    })
  }

  return (
    <Card
      title="分类"
      size="small"
      extra={isOwner && <Button type="link" icon={<PlusOutlined />} onClick={() => openEdit('new')}>新建</Button>}
      styles={{ body: { padding: 0 } }}
    >
      <List<Category>
        rowKey="id"
        dataSource={[ALL, ...categories]}
        renderItem={(item, i) => {
          const c = item.id === ALL.id ? null : item
          const active = (c?.id ?? null) === selectedId
          return (
            <List.Item
              onClick={() => onSelect(c?.id ?? null)}
              style={{ cursor: 'pointer', paddingInline: 16, background: active ? token.controlItemBgActive : undefined }}
              actions={
                c && isOwner
                  ? [
                      <Space key="ops" size={0} onClick={(e) => e.stopPropagation()}>
                        <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 1} onClick={() => move(i - 1, -1)} />
                        <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === categories.length} onClick={() => move(i - 1, 1)} />
                        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(c)} />
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(c)} />
                      </Space>,
                    ]
                  : undefined
              }
            >
              <Typography.Text strong={active}>{c ? c.name : '全部菜品'}</Typography.Text>
              {c && c.status === 0 && <Tag style={{ marginLeft: 8 }}>停用</Tag>}
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
      </Modal>
    </Card>
  )
}
