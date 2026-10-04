import Taro from '@tarojs/taro'
import { initPay, mockPay } from '../api/order'

export type PayOutcome = 'success' | 'cancel' | 'fail'

/**
 * 发起支付并拉起收银台。
 * 注意：success 只表示客户端流程走完，最终以服务端回调 / 查单后的订单状态为准（详情页轮询确认）。
 */
export async function payOrder(orderNo: string): Promise<PayOutcome> {
  const init = await initPay(orderNo)
  if (init.mock) {
    await mockPay(orderNo)
    return 'success'
  }
  try {
    if (process.env.TARO_ENV === 'alipay') {
      const res = (await Taro.tradePay({ tradeNO: String(init.params.tradeNO) })) as { resultCode?: string }
      // 9000 支付成功；8000 处理中 / 6004 结果未知：交由服务端回调或查单确认，不能提示用户重付；6001 用户取消
      if (res.resultCode === '6001') return 'cancel'
      return res.resultCode === '9000' || res.resultCode === '8000' || res.resultCode === '6004' ? 'success' : 'fail'
    }
    const p = init.params
    await Taro.requestPayment({
      timeStamp: String(p.timeStamp),
      nonceStr: String(p.nonceStr),
      package: String(p.package),
      signType: p.signType as 'RSA',
      paySign: String(p.paySign),
    })
    return 'success'
  } catch (e) {
    const msg = String((e as { errMsg?: string }).errMsg ?? '')
    return /cancel/i.test(msg) ? 'cancel' : 'fail'
  }
}
