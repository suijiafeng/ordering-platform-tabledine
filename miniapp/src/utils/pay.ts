import { initPay } from '../api/order'

export type PayOutcome = 'success' | 'fail'

/**
 * 发起支付。会员账号的订单一律余额支付：服务端在发起支付的同一事务里扣费并入账，没有收银台；
 * 余额不足时 initPay 抛 42203（请求层已提示）。小程序内不再调起微信 / 支付宝支付。
 */
export async function payOrder(orderNo: string): Promise<PayOutcome> {
  const init = await initPay(orderNo)
  return init.params.balance ? 'success' : 'fail'
}
