import type { CSSProperties, Key, KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Empty, Pagination, Spin, Table, Typography, theme as antdTheme } from 'antd'
import type { ColumnsType, ColumnType, TablePaginationConfig, TableProps } from 'antd/es/table'
import type { ColumnGroupType } from 'antd/es/table'
import { useIsMobile } from '../hooks/useIsMobile'

function isGroup<T>(col: ColumnType<T> | ColumnGroupType<T>): col is ColumnGroupType<T> {
  return 'children' in col && Array.isArray((col as ColumnGroupType<T>).children)
}

function isActionColumn<T>(col: ColumnType<T>): boolean {
  return col.fixed === 'right' || col.title === '操作'
}

function cellContent<T>(col: ColumnType<T>, record: T, index: number): ReactNode {
  const dataIndex = col.dataIndex
  let value: unknown
  if (typeof dataIndex === 'string' || typeof dataIndex === 'number') {
    value = (record as Record<string | number, unknown>)[dataIndex]
  } else if (Array.isArray(dataIndex)) {
    value = dataIndex.reduce<unknown>((acc, key) => (acc as Record<PropertyKey, unknown> | undefined)?.[key as PropertyKey], record)
  }
  if (col.render) return col.render(value, record, index) as ReactNode
  if (value == null || value === '') return <Typography.Text type="secondary">-</Typography.Text>
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return value as ReactNode
}

function rowKeyValue<T>(rowKey: TableProps<T>['rowKey'], record: T, index: number): Key {
  if (typeof rowKey === 'function') return rowKey(record)
  if (typeof rowKey === 'string') return (record as Record<string, Key>)[rowKey]
  return index
}

export type ResponsiveTableProps<T extends object> = {
  columns: ColumnsType<T>
  dataSource: readonly T[]
  rowKey: TableProps<T>['rowKey']
  loading?: boolean
  pagination?: false | TablePaginationConfig
  size?: TableProps<T>['size']
  scrollX?: number | string
  onRow?: TableProps<T>['onRow']
  /**
   * 手机卡片的自定义正文（不传则逐列「标题：值」排列）。
   * cell(title) 渲染指定标题那一列的单元格，开关、标签等交互可以直接复用列定义。操作列仍自动放在卡片底部。
   */
  renderCard?: (record: T, cell: (title: string) => ReactNode, index: number) => ReactNode
}

/**
 * 桌面 / 平板（≥768）：普通表格，操作列固定在右侧，横向滚动时仍能点到操作。
 * 手机（<768，与 useIsMobile 一致）：改成卡片列表，操作始终露在卡片底部。
 */
export default function ResponsiveTable<T extends object>({
  columns,
  dataSource,
  rowKey,
  loading,
  pagination,
  size = 'middle',
  scrollX,
  onRow,
  renderCard,
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile()
  const { token } = antdTheme.useToken()
  const flat = columns.filter((c): c is ColumnType<T> => !isGroup(c))
  const tableColumns: ColumnsType<T> = columns.map((c) => {
    if (isGroup(c) || !isActionColumn(c)) return c
    return { ...c, fixed: 'right' as const }
  })
  const inferredX = flat.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 140), 0)

  if (!isMobile) {
    return (
      <Table<T>
        rowKey={rowKey}
        size={size}
        loading={loading}
        columns={tableColumns}
        dataSource={dataSource as T[]}
        scroll={{ x: scrollX ?? Math.max(inferredX, 800) }}
        pagination={pagination}
        onRow={onRow}
      />
    )
  }

  const dataCols = flat.filter((c) => !isActionColumn(c))
  const actionCol = flat.find(isActionColumn)
  const paging = typeof pagination === 'object' && pagination ? pagination : null

  return (
    <Spin spinning={!!loading}>
      {dataSource.length === 0 && !loading ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {dataSource.map((record, index) => {
            const key = rowKeyValue(rowKey, record, index)
            const rowProps = onRow?.(record, index)
            const clickable = Boolean(rowProps?.onClick)
            const cardStyle: CSSProperties = {
              background: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadiusLG,
              padding: 16,
              cursor: clickable ? 'pointer' : undefined,
            }
            const ignoreClick = (target: EventTarget | null) => {
              return target instanceof Element && Boolean(target.closest('button, a, input, textarea, .ant-switch, .ant-input-number, .ant-image, .ant-pagination'))
            }
            return (
              <div
                key={key}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                style={cardStyle}
                onClick={(e: MouseEvent<HTMLDivElement>) => {
                  if (ignoreClick(e.target)) return
                  rowProps?.onClick?.(e as never)
                }}
                onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                  if (!clickable || e.target !== e.currentTarget) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    rowProps?.onClick?.(e as never)
                  }
                }}
              >
                {renderCard ? renderCard(record, (title) => {
                  const col = flat.find((c) => c.title === title)
                  return col ? cellContent(col, record, index) : null
                }, index) : (<>
                {dataCols.map((col, colIndex) => (
                  <div
                    key={String(col.key ?? (Array.isArray(col.dataIndex) ? col.dataIndex.join('.') : col.dataIndex) ?? colIndex)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '6px 0',
                    }}
                  >
                    <Typography.Text type="secondary" style={{ flex: 'none', maxWidth: '40%' }}>
                      {col.title as ReactNode}
                    </Typography.Text>
                    <div style={{ minWidth: 0, textAlign: 'right', flex: 1, overflowWrap: 'anywhere' }}>
                      {cellContent(col, record, index)}
                    </div>
                  </div>
                ))}
                </>)}
                {actionCol && (
                  <div
                    style={{
                      marginTop: 4,
                      paddingTop: 12,
                      borderTop: `1px solid ${token.colorSplit}`,
                      display: 'flex',
                      justifyContent: 'flex-end',
                      flexWrap: 'wrap',
                      gap: 4,
                    }}
                  >
                    {cellContent(actionCol, record, index)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {paging && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Pagination
            size="small"
            current={paging.current}
            pageSize={paging.pageSize}
            total={paging.total}
            showTotal={paging.showTotal}
            showSizeChanger={paging.showSizeChanger}
            onChange={paging.onChange}
          />
        </div>
      )}
    </Spin>
  )
}
