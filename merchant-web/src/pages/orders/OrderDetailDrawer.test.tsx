import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptOrder, approveCancelRequest, getOrder } from '../../api/order'
import type { OrderDetail } from '../../api/types'
import { deferred } from '../../test/deferred'
import { ApiError } from '../../utils/request'
import OrderDetailDrawer from './OrderDetailDrawer'

vi.mock('../../api/order', () => ({
  acceptOrder: vi.fn(), approveCancelRequest: vi.fn(), cancelOrder: vi.fn(),
  deliverOrder: vi.fn(), getOrder: vi.fn(), readyOrder: vi.fn(),
  rejectCancelRequest: vi.fn(), rejectOrder: vi.fn(), startCooking: vi.fn(),
}))
vi.mock('../../utils/auth', () => ({ useIsOwner: () => true, useIsKitchen: () => false }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('./RefundModal', () => ({ default: () => null }))
vi.mock('./SettleModal', () => ({ default: () => null }))

function order(orderNo: string, overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 1, orderNo, status: 'PAID', refundStatus: 'NONE', storeId: 1, storeName: 'Test',
    tableId: 1, tableCode: orderNo, platform: 'H5', totalAmount: 1000, payAmount: 1000,
    refundedAmount: 0, refundableAmount: 1000, peopleCount: 1, remark: null,
    payExpireAt: null, paidAt: '2026-10-12T09:00:00', acceptedAt: null,
    readyAt: null, doneAt: null, cancelledAt: null, cancelReason: null,
    createdAt: '2026-10-12T09:00:00', items: [], payment: null, refunds: [], logs: [],
    canCancel: true, canApplyRefund: false, ...overrides,
  }
}

const success = vi.fn()
const confirm = vi.fn()
const destroyConfirmation = vi.fn()

beforeEach(() => {
  confirm.mockReturnValue({ destroy: destroyConfirmation })
  vi.spyOn(App, 'useApp').mockReturnValue({
    message: { success, warning: vi.fn() }, modal: { confirm },
  } as unknown as ReturnType<typeof App.useApp>)
  vi.mocked(getOrder).mockImplementation((orderNo) => Promise.resolve(order(orderNo)))
})

const acceptButton = () => screen.getByText(/^接\s*单$/).closest('button') as HTMLButtonElement

async function accept() {
  fireEvent.click(acceptButton())
  fireEvent.click(screen.getByText('再点一次确认接单'))
  await act(async () => { await Promise.resolve() })
}

function drawer(orderNo: string | null, open = true, onClose = vi.fn(), onChanged = vi.fn()) {
  return <OrderDetailDrawer orderNo={orderNo} open={open} onClose={onClose} onChanged={onChanged} />
}

describe('OrderDetailDrawer request ownership', () => {
  it('does not reload A or replace B when an action on A fails after switching orders', async () => {
    const actionA = deferred<OrderDetail>()
    vi.mocked(acceptOrder).mockReturnValue(actionA.promise)
    const onChanged = vi.fn()
    const { rerender } = render(drawer('A', true, vi.fn(), onChanged))
    await screen.findByText('订单 A')
    await accept()

    rerender(drawer('B', true, vi.fn(), onChanged))
    await screen.findByText('订单 B')
    await act(async () => { actionA.reject(new ApiError(40900, 'Already changed')) })

    expect(getOrder).toHaveBeenCalledTimes(2)
    expect(screen.getByText('订单 B')).toBeTruthy()
    expect(screen.queryByText('订单 A')).toBeNull()
    expect(success).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it.each(['resolve', 'reject'] as const)('does not clear B action loading when old A action %ss', async (outcome) => {
    const actionA = deferred<OrderDetail>()
    const actionB = deferred<OrderDetail>()
    vi.mocked(acceptOrder).mockReturnValueOnce(actionA.promise).mockReturnValueOnce(actionB.promise)
    const onChanged = vi.fn()
    const { rerender } = render(drawer('A', true, vi.fn(), onChanged))
    await screen.findByText('订单 A')
    await accept()
    rerender(drawer('B', true, vi.fn(), onChanged))
    await screen.findByText('订单 B')
    expect(acceptButton().classList.contains('ant-btn-loading')).toBe(false)
    await accept()

    await act(async () => {
      if (outcome === 'resolve') actionA.resolve(order('A', { status: 'MAKING' }))
      else actionA.reject(new ApiError(40900, 'Already changed'))
    })
    expect(acceptButton().classList.contains('ant-btn-loading')).toBe(true)
    expect(screen.getByText('订单 B')).toBeTruthy()
    expect(getOrder).toHaveBeenCalledTimes(2)
    expect(success).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()

    await act(async () => { actionB.resolve(order('B', { status: 'MAKING', cookingStartedAt: null })) })
    expect(screen.getByRole('button', { name: '开始制作' }).classList.contains('ant-btn-loading')).toBe(false)
    expect(success).toHaveBeenCalledOnce()
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('refreshes the current order after its action fails and restores the action button', async () => {
    vi.mocked(acceptOrder).mockRejectedValue(new ApiError(40900, 'Already changed'))
    render(drawer('A'))
    await screen.findByText('订单 A')
    await accept()
    await waitFor(() => expect(getOrder).toHaveBeenCalledTimes(2))
    expect(acceptButton().classList.contains('ant-btn-loading')).toBe(false)
  })

  it('invalidates a pending action when closing and reopening the same order', async () => {
    const action = deferred<OrderDetail>()
    vi.mocked(acceptOrder).mockReturnValue(action.promise)
    const onChanged = vi.fn()
    const { rerender } = render(drawer('A', true, vi.fn(), onChanged))
    await screen.findByText('订单 A')
    await accept()
    rerender(drawer('A', false, vi.fn(), onChanged))
    rerender(drawer('A', true, vi.fn(), onChanged))
    await screen.findByText(/^接\s*单$/)
    await act(async () => { action.resolve(order('A', { status: 'MAKING', cookingStartedAt: null })) })
    expect(acceptButton()).toBeTruthy()
    expect(success).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it.each(['resolve', 'reject'] as const)('ignores a detail request that %ss after closing', async (outcome) => {
    const detail = deferred<OrderDetail>()
    vi.mocked(getOrder).mockReturnValue(detail.promise)
    const onClose = vi.fn()
    const { rerender } = render(drawer('A', true, onClose))
    rerender(drawer('A', false, onClose))
    await act(async () => {
      if (outcome === 'resolve') detail.resolve(order('A'))
      else detail.reject(new ApiError(40400, 'No order'))
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText('订单 A')).toBeNull()
  })

  it.each(['resolve', 'reject'] as const)('keeps the newer detail load active when the old request %ss', async (outcome) => {
    const detailA = deferred<OrderDetail>()
    const detailB = deferred<OrderDetail>()
    vi.mocked(getOrder).mockReturnValueOnce(detailA.promise).mockReturnValueOnce(detailB.promise)
    const onClose = vi.fn()
    const { rerender } = render(drawer('A', true, onClose))
    rerender(drawer('B', true, onClose))
    await act(async () => {
      if (outcome === 'resolve') detailA.resolve(order('A'))
      else detailA.reject(new ApiError(40400, 'No old order'))
    })
    expect(document.querySelector('.ant-spin-spinning')).not.toBeNull()
    expect(screen.queryByText('订单 A')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => { detailB.resolve(order('B')) })
    expect(screen.getByText('订单 B')).toBeTruthy()
    expect(document.querySelector('.ant-spin-spinning')).toBeNull()
  })

  it('ignores a failed detail request after unmounting', async () => {
    const detail = deferred<OrderDetail>()
    vi.mocked(getOrder).mockReturnValue(detail.promise)
    const onClose = vi.fn()
    const { unmount } = render(drawer('A', true, onClose))
    unmount()
    await act(async () => { detail.reject(new ApiError(40400, 'No old order')) })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not execute a confirmation belonging to the previously open order', async () => {
    vi.mocked(getOrder).mockImplementation((orderNo) => Promise.resolve(order(orderNo, {
      status: 'MAKING', cancelRequest: {
        status: 'APPLYING', reason: 'Cancel', requestedAt: '2026-10-12T09:00:00',
        handledAt: null, rejectReason: null,
      },
    })))
    const { rerender } = render(drawer('A'))
    await screen.findByText('订单 A')
    fireEvent.click(screen.getByText('同意取消并退款'))
    const oldConfirmation = confirm.mock.calls[0][0] as { onOk: () => Promise<boolean> }
    rerender(drawer('B'))
    await screen.findByText('订单 B')
    expect(destroyConfirmation).toHaveBeenCalledOnce()
    await act(async () => { await oldConfirmation.onOk() })
    expect(approveCancelRequest).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })
})
