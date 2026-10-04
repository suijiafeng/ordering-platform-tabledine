'use client'

import { useFeedback } from '@/store/feedback'

export function Feedback() {
  const { message, kind, hide } = useFeedback()
  if (!message) return null
  return <button className={`feedback ${kind}`} onClick={hide} aria-live="polite">{kind === 'success' ? '✓ ' : ''}{message}</button>
}
