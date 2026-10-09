import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Result, Space, Spin } from 'antd'
import { listTables } from '../../api/table'
import { fetchStore } from '../../api/store'
import type { TableItem } from '../../api/types'
import { qrDataUrl } from '../../utils/qrcode'

interface Card {
  table: TableItem
  qr: string
}

/**
 * 桌码打印页：A4 每页 6 张（2 列 × 3 行），浏览器打印。
 * 要打印的桌台放在网址 ?ids=1,2,3 里（刷新、新标签页打开都不丢）；不带 ids 时打印全部「可用」桌台，已停用的桌码扫了也无法点餐，不打印。
 */
export default function TablePrintPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const idsParam = params.get('ids') ?? ''
  const ids = useMemo(() => idsParam.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0), [idsParam])
  const [cards, setCards] = useState<Card[] | null>(null)
  /** 打印说明：未勾选时跳过了几张停用的；勾选的里面有几张已删除 / 已停用 */
  const [notes, setNotes] = useState<string[]>([])
  const [storeName, setStoreName] = useState('')
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadError(false)
      try {
        const [all, store] = await Promise.all([listTables(), fetchStore()])
        const tips: string[] = []
        let list: TableItem[]
        if (ids.length) {
          list = all.filter((t) => ids.includes(t.id))
          const missing = ids.length - list.length
          if (missing > 0) tips.push(`勾选的桌台中有 ${missing} 张已被删除，已跳过。`)
          const disabled = list.filter((t) => t.status !== 1)
          if (disabled.length) tips.push(`桌台 ${disabled.map((t) => t.code).join('、')} 已停用，扫码无法点餐，请确认是否需要打印。`)
        } else {
          list = all.filter((t) => t.status === 1)
          const skipped = all.length - list.length
          if (skipped > 0) tips.push(`未勾选桌台：打印全部可用桌台，已停用的 ${skipped} 张未包含。`)
        }
        const rendered = await Promise.all(list.map(async (t) => ({ table: t, qr: await qrDataUrl(t.qrUrl, 480) })))
        if (!cancelled) {
          setStoreName(store.name)
          setCards(rendered)
          setNotes(tips)
        }
      } catch {
        // 首次加载（含二维码生成）：页面展示错误状态与重试入口
        if (!cancelled) {
          setLoadError(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ids])

  return (
    <div className="print-root">
      <style>{`
        .print-root { padding: 24px; background: #f5f5f5; min-height: 100vh; }
        .print-toolbar { margin-bottom: 16px; }
        .print-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; max-width: 800px; margin: 0 auto; }
        .print-card { background: #fff; border: 1px dashed #bbb; border-radius: 12px; padding: 20px; text-align: center; break-inside: avoid; }
        .print-card h3 { margin: 0 0 8px; font-size: 20px; }
        .print-card img { width: 70%; }
        .print-card .code { font-size: 32px; font-weight: 700; margin-top: 4px; }
        .print-card .tip { color: #666; font-size: 14px; }
        @media print {
          /* A4 高 297mm，上下边距各 10mm，可用 277mm：3 行 × 84mm + 2 × 8mm 间距 = 268mm */
          @page { size: A4; margin: 10mm; }
          .print-root { padding: 0; background: #fff; }
          .print-toolbar { display: none; }
          .print-grid { gap: 8mm; max-width: none; }
          .print-card { box-sizing: border-box; height: 84mm; padding: 4mm; border-radius: 0; }
          .print-card img { width: auto; height: 50mm; }
        }
      `}</style>
      <Space className="print-toolbar">
        <Button onClick={() => navigate('/tables')}>返回</Button>
        <Button type="primary" disabled={!cards?.length} onClick={() => window.print()}>打印{cards?.length ? `（${cards.length} 张）` : ''}</Button>
      </Space>
      {notes.length > 0 && (
        <Alert className="print-toolbar" type="warning" showIcon style={{ maxWidth: 800, margin: '0 auto 16px' }} message={notes.map((n) => <div key={n}>{n}</div>)} />
      )}
      {loadError ? (
        <Result status="error" title="桌码加载失败" extra={<Button type="primary" onClick={() => navigate('/tables')}>返回桌台管理</Button>} />
      ) : !cards ? (
        <Spin />
      ) : cards.length === 0 ? (
        <Result
          status="info"
          title="没有可打印的桌码"
          subTitle={ids.length ? '勾选的桌台已不存在，请返回重新选择。' : '还没有可用的桌台，请先在桌台管理中新建或启用。'}
          extra={<Button type="primary" onClick={() => navigate('/tables')}>返回桌台管理</Button>}
        />
      ) : (
        <div className="print-grid">
          {cards.map(({ table, qr }) => (
            <div className="print-card" key={table.id}>
              <h3>{storeName}</h3>
              <img src={qr} alt={table.code} />
              <div className="code">桌号 {table.code}</div>
              <div className="tip">手机扫码点餐</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
