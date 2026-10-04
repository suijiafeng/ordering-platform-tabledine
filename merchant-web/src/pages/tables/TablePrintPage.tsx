import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Space, Spin } from 'antd'
import { listTables } from '../../api/table'
import { fetchStore } from '../../api/store'
import type { TableItem } from '../../api/types'
import { qrDataUrl } from '../../utils/qrcode'

interface Card {
  table: TableItem
  qr: string
}

/** 桌码打印页：A4 每页 6 张（2 列 × 3 行），浏览器打印 */
export default function TablePrintPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const ids = (location.state as { ids?: number[] } | null)?.ids
  const [cards, setCards] = useState<Card[] | null>(null)
  const [storeName, setStoreName] = useState('')

  useEffect(() => {
    ;(async () => {
      const [all, store] = await Promise.all([listTables(), fetchStore()])
      setStoreName(store.name)
      const list = ids?.length ? all.filter((t) => ids.includes(t.id)) : all
      setCards(await Promise.all(list.map(async (t) => ({ table: t, qr: await qrDataUrl(t.qrUrl, 480) }))))
    })()
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
          @page { size: A4; margin: 10mm; }
          .print-root { padding: 0; background: #fff; }
          .print-toolbar { display: none; }
          .print-grid { gap: 8mm; max-width: none; }
          .print-card { height: 88mm; padding: 4mm; }
          .print-card img { width: auto; height: 55mm; }
        }
      `}</style>
      <Space className="print-toolbar">
        <Button onClick={() => navigate('/tables')}>返回</Button>
        <Button type="primary" disabled={!cards?.length} onClick={() => window.print()}>打印</Button>
      </Space>
      {!cards ? (
        <Spin />
      ) : (
        <div className="print-grid">
          {cards.map(({ table, qr }) => (
            <div className="print-card" key={table.id}>
              <h3>{storeName}</h3>
              <img src={qr} alt={table.code} />
              <div className="code">桌号 {table.code}</div>
              <div className="tip">微信 / 支付宝扫码点餐</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
