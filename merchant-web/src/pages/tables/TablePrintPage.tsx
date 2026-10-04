import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
<<<<<<< HEAD
import { Button, Result, Space, Spin } from 'antd'
=======
import { Button, Space, Spin } from 'antd'
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
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
<<<<<<< HEAD
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadError(false)
      try {
        const [all, store] = await Promise.all([listTables(), fetchStore()])
        const list = ids?.length ? all.filter((t) => ids.includes(t.id)) : all
        const rendered = await Promise.all(list.map(async (t) => ({ table: t, qr: await qrDataUrl(t.qrUrl, 480) })))
        if (!cancelled) {
          setStoreName(store.name)
          setCards(rendered)
        }
      } catch {
        if (!cancelled) {
          setLoadError(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
=======

  useEffect(() => {
    ;(async () => {
      const [all, store] = await Promise.all([listTables(), fetchStore()])
      setStoreName(store.name)
      const list = ids?.length ? all.filter((t) => ids.includes(t.id)) : all
      setCards(await Promise.all(list.map(async (t) => ({ table: t, qr: await qrDataUrl(t.qrUrl, 480) }))))
    })()
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
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
<<<<<<< HEAD
          /* A4 高 297mm，上下边距各 10mm，可用 277mm：3 行 × 84mm + 2 × 8mm 间距 = 268mm */
=======
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
          @page { size: A4; margin: 10mm; }
          .print-root { padding: 0; background: #fff; }
          .print-toolbar { display: none; }
          .print-grid { gap: 8mm; max-width: none; }
<<<<<<< HEAD
          .print-card { box-sizing: border-box; height: 84mm; padding: 4mm; border-radius: 0; }
          .print-card img { width: auto; height: 50mm; }
=======
          .print-card { height: 88mm; padding: 4mm; }
          .print-card img { width: auto; height: 55mm; }
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
        }
      `}</style>
      <Space className="print-toolbar">
        <Button onClick={() => navigate('/tables')}>返回</Button>
        <Button type="primary" disabled={!cards?.length} onClick={() => window.print()}>打印</Button>
      </Space>
<<<<<<< HEAD
      {loadError ? (
        <Result status="error" title="桌码加载失败" extra={<Button type="primary" onClick={() => navigate('/tables')}>返回桌台管理</Button>} />
      ) : !cards ? (
=======
      {!cards ? (
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
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
