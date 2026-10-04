import { useAuthStore } from '../store/auth'

export function useIsOwner(): boolean {
  return useAuthStore((s) => s.staff?.role === 'OWNER')
}
