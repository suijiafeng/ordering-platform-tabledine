'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { fetchOrder } from '@/lib/api'
import { ignoreShownError } from '@/lib/errors'
import { orderStatusDesc, orderStatusText, yuan } from '@/lib/format'
import { menuPath } from '@/lib/navigation'
import type { OrderDetail } from '@/lib/types'
import { useOrdering } from '@/store/ordering'
import { AppBar, CheckIcon, EmptyState, PillButton, Price, Skeleton } from '@/components/ui'

const PAID_STATUSES = new Set(['PAID', 'MAKING', 'READY', 'DONE'])

/** 查询订单后才能确认支付结果；网络失败或未支付时，不展示成功图标与备餐文案。 */
function PaidView({ orderNo }: { orderNo: string }) {
  const router = useRouter()
  const table = useOrdering((state) => state.table)
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const requestSeq = useRef(0)
  const invalidate = useCallback(() => { requestSeq.current++ }, [])
  const orderPath = `/order?orderNo=${encodeURIComponent(orderNo)}`

  const load = useCallback(async () => {
    if (!orderNo) { router.replace('/orders'); return }
    const seq = ++requestSeq.current
    setLoading(true)
    setFailed(false)
    try {
      const result = await fetchOrder(orderNo)
      if (seq === requestSeq.current) setOrder(result)
    } catch (e) {
      if (seq === requestSeq.current) setFailed(true)
      ignoreShownError(e)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [orderNo, router])

  useEffect(() => {
    void load()
    return invalidate
  }, [load, invalidate])

  if (loading) return <div className="screen"><AppBar title="支付结果" fallback="/orders" /><Skeleton variant="card" rows={2} label="正在确认支付结果…" /></div>
  if (failed || !order) {
    return (
      <div className="screen">
        <AppBar title="支付结果" fallback="/orders" />
        <EmptyState icon="!" title="暂时无法确认支付结果" desc="请先查询订单，确认状态后再操作，避免重复支付。" action={<>
          <PillButton onClick={() => void load()}>重新查询</PillButton>
          <PillButton variant="plain" onClick={() => router.replace(orderPath)}>查看订单</PillButton>
        </>} />
      </div>
    )
  }
  if (!PAID_STATUSES.has(order.status)) {
    return (
      <div className="screen">
        <AppBar title="支付结果" fallback="/orders" />
        <EmptyState icon="单" title={order.status === 'PENDING_PAY' ? '订单尚未支付' : orderStatusText(order.status)}
          desc={order.cancelReason || (order.status === 'PENDING_PAY' ? '请核对菜品和金额，再从余额完成支付。' : order.status === 'CANCELLED' ? '请到订单详情查看取消原因和退款进度。' : orderStatusDesc(order.status))}
          action={<PillButton onClick={() => router.replace(orderPath)}>{order.status === 'PENDING_PAY' ? '核对订单并支付' : '查看订单详情'}</PillButton>} />
      </div>
    )
  }

  return (
    <div className="result">
      <span className="result-mark"><CheckIcon /></span>
      <h1>支付成功</h1>
      <div className="amount"><Price value={yuan(order.payAmount)} /></div>
      <div className="result-next">
        <strong>{orderStatusText(order.status)}</strong>
        <span>{orderStatusDesc(order.status)}</span>
      </div>
      <div className="meta">{order.tableCode}桌 · {order.storeName}<br />订单号 {order.orderNo}</div>
      <div className="result-acts">
        <PillButton size="lg" block onClick={() => router.replace(orderPath)}>查看订单进度</PillButton>
        <PillButton size="lg" block variant="plain" onClick={() => router.replace(menuPath(table?.qrToken))}>返回菜单</PillButton>
      </div>
      <p className="foot">后续可在「我的订单」查看进度或联系店员</p>
    </div>
  )
}

function PaidRoute() {
  const orderNo = useSearchParams().get('orderNo') || ''
  return <PaidView key={orderNo} orderNo={orderNo} />
}

export default function PaidPage() {
  return <Suspense fallback={<Skeleton variant="card" rows={2} label="正在确认支付结果…" />}><PaidRoute /></Suspense>
}
