import { useAuthStore } from '../store/auth'
import type { StaffRole } from '../api/types'

/** 角色显示名与标签颜色 */
export const ROLE_META: Record<StaffRole, { label: string; color: string }> = {
  OWNER: { label: '店主', color: 'gold' },
  STAFF: { label: '前厅', color: 'blue' },
  KITCHEN: { label: '后厨', color: 'orange' },
}

export function useRole(): StaffRole | undefined {
  return useAuthStore((s) => s.staff?.role)
}

export function useIsOwner(): boolean {
  return useAuthStore((s) => s.staff?.role === 'OWNER')
}

/** 后厨账号：在后厨队列开始制作 / 出餐；订单管理与菜品管理只能查看，不能接单 / 拒单 / 送达 / 沽清 */
export function useIsKitchen(): boolean {
  return useAuthStore((s) => s.staff?.role === 'KITCHEN')
}
