import { fireEvent, render, screen } from '@testing-library/react'
import { App } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import ConfirmButton from './ConfirmButton'

/** antd 会在连续汉字之间插入空格，按去掉空白后的文案点按钮 */
function click(text: string) {
  fireEvent.click(screen.getByRole('button', {
    name: (_name, el) => (el.textContent ?? '').replace(/\s+/g, '') === text,
  }))
}

describe('ConfirmButton', () => {
  it('keeps the confirm dialog open so a slow second click still runs the action', () => {
    const onConfirm = vi.fn()
    render(
      <App>
        <ConfirmButton confirmText="确认接单？" onConfirm={onConfirm}>接单</ConfirmButton>
      </App>,
    )
    click('接单')
    expect(screen.getAllByText('确认接单？').length).toBeGreaterThan(0)
    click('确认')
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('does not run the action when the dialog is cancelled', () => {
    const onConfirm = vi.fn()
    render(
      <App>
        <ConfirmButton confirmText="确认接单？" onConfirm={onConfirm}>接单</ConfirmButton>
      </App>,
    )
    click('接单')
    click('取消')
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
