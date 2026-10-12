import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refundOrder } from '../../api/order'
import type { OrderDetail, RefundView } from '../../api/types'
import { deferred } from '../../test/deferred'
import { ApiError } from '../../utils/request'
import RefundModal from './RefundModal'
import { loadPendingRefund } from './pendingRefund'

vi.mock('../../api/order', () => ({ refundOrder: vi.fn() }))

function order(orderNo = 'A', refundableAmount = 10000): OrderDetail {
  return {
    id: 1, orderNo, status: 'MAKING', refundStatus: 'NONE', storeId: 1, storeName: 'Test',
    tableId: 1, tableCode: 'A1', platform: 'H5', totalAmount: 10000, payAmount: 10000,
    refundedAmount: 10000 - refundableAmount, refundableAmount, peopleCount: 1, remark: null,
    payExpireAt: null, paidAt: '2026-10-12T09:00:00', acceptedAt: null,
    readyAt: null, doneAt: null, cancelledAt: null, cancelReason: null,
    createdAt: '2026-10-12T09:00:00', items: [], payment: null, refunds: [], logs: [],
    canCancel: false, canApplyRefund: true,
  }
}

const success = vi.fn()
const confirm = vi.fn()
const error = vi.fn()
const receipt = { refundNo: 'refund-1', amount: 1000, status: 'SUCCESS' } as RefundView

beforeEach(() => {
  sessionStorage.clear()
  vi.spyOn(App, 'useApp').mockReturnValue({
    message: { success, warning: vi.fn(), error }, modal: { confirm },
  } as unknown as ReturnType<typeof App.useApp>)
  confirm.mockResolvedValue(true)
  vi.mocked(refundOrder).mockResolvedValue(receipt)
})

afterEach(() => {
  if (vi.isMockFunction(Storage.prototype.setItem)) vi.mocked(Storage.prototype.setItem).mockRestore()
})

const refundButton = () => screen.getByRole('button', { name: '确认退款' })
function fillCustomRefund() {
  fireEvent.click(screen.getByText('自定义金额'))
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } })
  fireEvent.change(screen.getByPlaceholderText('如：菜品缺料无法制作'), { target: { value: '售后补偿' } })
}
function modal(current: OrderDetail, open = true, onDone = vi.fn()) {
  return <RefundModal order={current} open={open} onClose={vi.fn()} onDone={onDone} />
}

describe('merchant refund request identity', () => {
  it('retries a lost success response with the exact original ID and payload', async () => {
    vi.mocked(refundOrder).mockRejectedValueOnce(new ApiError(-1, '网络超时'))
    const onDone = vi.fn()
    const { rerender } = render(modal(order(), true, onDone))
    fillCustomRefund()
    fireEvent.click(refundButton())
    await waitFor(() => expect(refundOrder).toHaveBeenCalledTimes(1))
    await screen.findByText('上次退款结果尚未确认，重试将确认同一笔退款')
    const original = vi.mocked(refundOrder).mock.calls[0][1]
    expect(original.amount).toBe(1000)
    expect(original.clientRequestId).toMatch(/^[0-9a-f]{32}$/)
    expect((screen.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByPlaceholderText('如：菜品缺料无法制作') as HTMLInputElement).disabled).toBe(true)
    rerender(modal(order('A', 9000), true, onDone))
    fireEvent.click(screen.getByRole('button', { name: '重试确认原退款' }))
    await waitFor(() => expect(refundOrder).toHaveBeenCalledTimes(2))
    expect(vi.mocked(refundOrder).mock.calls[1]).toEqual(['A', original])
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(loadPendingRefund('A')).toBeNull()
  })

  it('restores an unresolved refund across close, reopen and remount', async () => {
    vi.mocked(refundOrder).mockRejectedValueOnce(new ApiError(-1, '响应丢失'))
    const { rerender, unmount } = render(modal(order()))
    fillCustomRefund()
    fireEvent.click(refundButton())
    await screen.findByRole('button', { name: '重试确认原退款' })
    await waitFor(() => expect(screen.getByRole('button', { name: '重试确认原退款' }).classList.contains('ant-btn-loading')).toBe(false))
    const original = vi.mocked(refundOrder).mock.calls[0][1]
    rerender(modal(order(), false))
    rerender(modal(order('A', 9000)))
    expect(loadPendingRefund('A')?.request).toEqual(original)
    unmount()
    render(modal(order('A', 9000)))
    await screen.findByRole('button', { name: '重试确认原退款' })
    fireEvent.click(screen.getByRole('button', { name: '重试确认原退款' }))
    await waitFor(() => expect(refundOrder).toHaveBeenCalledTimes(2))
    expect(vi.mocked(refundOrder).mock.calls[1][1]).toEqual(original)
  })

  it('opens one confirmation and sends one request on an immediate double click', async () => {
    const answer = deferred<boolean>()
    confirm.mockReturnValue(answer.promise)
    render(modal(order()))
    fillCustomRefund()
    const button = refundButton()
    fireEvent.click(button)
    fireEvent.click(button)
    expect(confirm).toHaveBeenCalledOnce()
    expect(refundOrder).not.toHaveBeenCalled()
    await act(async () => { answer.resolve(true) })
    expect(refundOrder).toHaveBeenCalledOnce()
  })

  it('does not submit a confirmation that resolves after switching orders', async () => {
    const answer = deferred<boolean>()
    confirm.mockReturnValue(answer.promise)
    const { rerender } = render(modal(order()))
    fillCustomRefund()
    fireEvent.click(refundButton())
    rerender(modal(order('B')))
    await act(async () => { answer.resolve(true) })
    expect(refundOrder).not.toHaveBeenCalled()
    expect(loadPendingRefund('A')).toBeNull()
  })

  it('does not clear B loading or invoke stale callbacks after A responds late', async () => {
    const responseA = deferred<RefundView>()
    const responseB = deferred<RefundView>()
    vi.mocked(refundOrder).mockReturnValueOnce(responseA.promise).mockReturnValueOnce(responseB.promise)
    const onDone = vi.fn()
    const { rerender } = render(modal(order(), true, onDone))
    fillCustomRefund()
    fireEvent.click(refundButton())
    await waitFor(() => expect(refundOrder).toHaveBeenCalledTimes(1))
    rerender(modal(order('B'), true, onDone))
    fillCustomRefund()
    fireEvent.click(refundButton())
    await waitFor(() => expect(refundOrder).toHaveBeenCalledTimes(2))
    await act(async () => { responseA.resolve(receipt) })
    expect(onDone).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
    expect(screen.getByText('重试确认原退款').closest('button')?.classList.contains('ant-btn-loading')).toBe(true)
    expect(loadPendingRefund('B')).not.toBeNull()
    await act(async () => { responseB.resolve(receipt) })
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('fails closed if request recovery storage is corrupt', () => {
    sessionStorage.setItem('merchant-pending-refund:A', '{broken')
    render(modal(order()))
    expect((refundButton() as HTMLButtonElement).disabled).toBe(true)
    expect(refundOrder).not.toHaveBeenCalled()
  })

  it('does not send if the immutable request cannot be saved first', async () => {
    render(modal(order()))
    fillCustomRefund()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked') })
    fireEvent.click(refundButton())
    await waitFor(() => expect(error).toHaveBeenCalledOnce())
    expect(refundOrder).not.toHaveBeenCalled()
  })

  it('allows editing after a definitive first-attempt validation rejection', async () => {
    vi.mocked(refundOrder).mockRejectedValueOnce(new ApiError(42202, '余额不足', 422))
    render(modal(order()))
    fillCustomRefund()
    fireEvent.click(refundButton())
    await waitFor(() => expect(refundOrder).toHaveBeenCalledOnce())
    await waitFor(() => expect((screen.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(false))
    expect(loadPendingRefund('A')).toBeNull()
  })
})
