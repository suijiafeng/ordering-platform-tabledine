import { act, render, screen } from '@testing-library/react'
import { App, ConfigProvider } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { listOrders } from '../../api/order'
import { listRefunds } from '../../api/refund'
import type { OrderSummary, RefundView } from '../../api/types'
import { deferred } from '../../test/deferred'
import { ApiError } from '../../utils/request'
import OrdersPage from './OrdersPage'
import RefundsPage from '../refunds/RefundsPage'

vi.mock('../../api/order', () => ({ listOrders: vi.fn() }))
vi.mock('../../api/refund', () => ({ listRefunds: vi.fn() }))
vi.mock('../../utils/auth', () => ({ useIsKitchen: () => false }))
vi.mock('./OrderDetailDrawer', () => ({ default: () => null }))
vi.mock('../../hooks/useOrderPoll', () => {
  // Keep every global count unchanged: these changes must not rely on a count delta.
  const state = { counts: null, newArrived: 0, consumeNew: vi.fn() }
  return { usePollStore: (select: (current: typeof state) => unknown) => select(state) }
})

const summary: OrderSummary = {
  id: 1, orderNo: 'SYNC-ORDER', status: 'MAKING', refundStatus: 'NONE', tableCode: 'A1', platform: 'H5',
  totalAmount: 1000, payAmount: 1000, refundedAmount: 0, peopleCount: 1, remark: null, itemCount: 0,
  items: [], createdAt: '2026-10-12T09:00:00', payExpireAt: null, paidAt: '2026-10-12T09:00:00',
  acceptedAt: '2026-10-12T09:00:00', readyAt: null, cookingStartedAt: null,
}
const refund: RefundView = {
  id: 1, refundNo: 'SYNC-REFUND', orderNo: summary.orderNo, tableCode: 'A1', type: 'FULL',
  initiator: 'MERCHANT', amount: 1000, reason: 'Compensation', rejectReason: null, status: 'PROCESSING',
  failReason: null, channelRefundNo: null, operatorId: 1, operatorName: 'Owner',
  createdAt: '2026-10-12T09:00:00', successAt: null, items: [],
}

beforeEach(() => {
  vi.mocked(listOrders).mockReset()
  vi.mocked(listRefunds).mockReset()
})

function orders() {
  return render(<MemoryRouter initialEntries={['/orders?status=MAKING']}><OrdersPage /></MemoryRouter>)
}

function refunds() {
  return render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <MemoryRouter initialEntries={['/refunds?status=']}><App><RefundsPage /></App></MemoryRouter>
    </ConfigProvider>,
  )
}

describe('live order and refund lists', () => {
  it('shows a kitchen start even when all summary counts stay unchanged, keeping old rows while syncing', async () => {
    const background = deferred<{ list: OrderSummary[]; total: number; page: number; pageSize: number }>()
    vi.mocked(listOrders).mockResolvedValueOnce({ list: [summary], total: 1, page: 1, pageSize: 20 }).mockReturnValueOnce(background.promise)
    orders()
    await screen.findByText('待制作')
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(screen.getByText(summary.orderNo)).toBeTruthy()
    expect(document.querySelector('.ant-spin-spinning')).toBeNull()
    await act(async () => { background.resolve({ list: [{ ...summary, cookingStartedAt: '2026-10-12T09:01:00' }], total: 1, page: 1, pageSize: 20 }) })
    expect(screen.queryByText('待制作')).toBeNull()
    expect(screen.getByText('制作中')).toBeTruthy()
    expect(listOrders).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'MAKING', page: 1 }), { silent: true })
  })

  it('shows refund completion even when applying and failed counts never change', async () => {
    vi.mocked(listRefunds).mockResolvedValueOnce({ list: [refund], total: 1, page: 1, pageSize: 20 })
      .mockResolvedValueOnce({ list: [{ ...refund, status: 'SUCCESS' }], total: 1, page: 1, pageSize: 20 })
    refunds()
    await screen.findByText(refund.refundNo)
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(screen.getByText('退款成功')).toBeTruthy()
    expect(listRefunds).toHaveBeenLastCalledWith({ status: undefined, page: 1, pageSize: 20 }, { silent: true })
  })

  it('preserves visible refund records on a background error and recovers on reconnect', async () => {
    vi.mocked(listRefunds).mockResolvedValueOnce({ list: [refund], total: 1, page: 1, pageSize: 20 })
      .mockRejectedValueOnce(new ApiError(-1, 'Offline'))
      .mockResolvedValueOnce({ list: [{ ...refund, status: 'SUCCESS' }], total: 1, page: 1, pageSize: 20 })
    refunds()
    await screen.findByText(refund.refundNo)
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(screen.getByText(refund.refundNo)).toBeTruthy()
    expect(screen.getByText(/退款同步暂时中断/)).toBeTruthy()
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(screen.getByText('退款成功')).toBeTruthy()
    expect(screen.queryByText(/退款同步暂时中断/)).toBeNull()
  })
})
