'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { fetchOrder } from '@/lib/api'
import { ignoreShownError } from '@/lib/errors'
import { yuan } from '@/lib/format'
import { menuPath } from '@/lib/navigation'
import type { OrderDetail } from '@/lib/types'
import { useOrdering } from '@/store/ordering'
import { CheckIcon, PillButton } from '@/components/ui'

/** 支付成功：结算页或收银台付款后先到这里，再去订单详情或回菜单 */
function PaidView() {
  const router = useRouter()
  const orderNo = useSearchParams().get('orderNo') || ''
  const table = useOrdering((state) => state.table)
  const [order, setOrder] = useState<OrderDetail | null>(null)

  useEffect(() => {
    if (!orderNo) { router.replace('/orders'); return }
    fetchOrder(orderNo).then(setOrder).catch((e: unknown) => { ignoreShownError(e) })  // 拉不到金额也不影响跳转
  }, [orderNo, router])

  return (
    <div className="result">
      <span className="result-mark"><CheckIcon /></span>
      <h1>支付成功</h1>
      {order && <div className="amount">¥{yuan(order.payAmount)}</div>}
      <div className="meta">
        订单号 {orderNo}<br />
        {order ? `${order.tableCode}桌 · 商家正在备餐，请留意订单进度` : '商家正在备餐，请留意订单进度'}
      </div>
      <div className="result-acts">
        <PillButton size="lg" block onClick={() => router.replace(`/order?orderNo=${encodeURIComponent(orderNo)}`)}>查看订单</PillButton>
        <PillButton size="lg" block variant="plain" onClick={() => router.replace(menuPath(table?.qrToken))}>回首页</PillButton>
      </div>
      <p className="foot">支付如有问题，可在「我的订单」中查看或联系店员</p>
    </div>
  )
}

export default function PaidPage() {
  return <Suspense><PaidView /></Suspense>
}
