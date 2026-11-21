import { fireEvent, render, screen } from '@testing-library/react'
import { Button } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import type { ColumnsType } from 'antd/es/table'
import ResponsiveTable from './ResponsiveTable'

const mobileState = vi.hoisted(() => ({ value: false }))
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => mobileState.value }))

type Row = { id: number; name: string; amount: number }

const rows: Row[] = [
  { id: 1, name: 'A1', amount: 10 },
  { id: 2, name: 'B2', amount: 20 },
]

const columns: ColumnsType<Row> = [
  { title: '名称', dataIndex: 'name' },
  { title: '金额', dataIndex: 'amount', width: 80 },
  { title: '操作', width: 80, render: (_, r) => <Button type="link" onClick={() => onAction(r.id)}>详情</Button> },
]

const onAction = vi.fn()
const onRowClick = vi.fn()

describe('ResponsiveTable', () => {
  it('pins the action column on desktop / tablet and keeps the table layout', () => {
    mobileState.value = false
    const { container } = render(
      <ResponsiveTable rowKey="id" columns={columns} dataSource={rows} pagination={false} />,
    )
    expect(container.querySelector('.ant-table')).toBeTruthy()
    expect(screen.getAllByText('详情')).toHaveLength(2)
    // antd marks fixed columns with ant-table-cell-fix-right
    expect(container.querySelector('.ant-table-cell-fix-right')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '名称' })).toBeNull()
  })

  it('renders records as cards on mobile with visible actions', () => {
    mobileState.value = true
    render(
      <ResponsiveTable
        rowKey="id"
        columns={columns}
        dataSource={rows}
        pagination={{ current: 1, pageSize: 20, total: 2, showTotal: (t) => `共 ${t} 条`, onChange: () => undefined }}
        onRow={(r) => ({ onClick: () => onRowClick(r.id) })}
      />,
    )
    expect(document.querySelector('.ant-table')).toBeNull()
    expect(screen.getByText('A1')).toBeTruthy()
    expect(screen.getByText('B2')).toBeTruthy()
    const actions = screen.getAllByText('详情')
    expect(actions).toHaveLength(2)
    fireEvent.click(actions[0])
    expect(onAction).toHaveBeenCalledWith(1)
    expect(onRowClick).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('A1').closest('[role="button"]') as HTMLElement)
    expect(onRowClick).toHaveBeenCalledWith(1)
    expect(screen.getByText('共 2 条')).toBeTruthy()
  })
})
