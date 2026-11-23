import dayjs, { type ConfigType, type Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * 门店时区。后端按 Asia/Shanghai 划分「今天」、每日限量和报表日期（见 MerchantOrderService / DailyStockService），
 * 后台显示的时间、小时分桶和日期参数都按门店墙钟算，不随浏览器所在时区变化（店主出差在外地也看到门店的时间）。
 */
export const STORE_TZ = 'Asia/Shanghai'

/** 某个时刻（默认现在）在门店时区的时间，用于显示和取小时 */
export function storeTime(value?: ConfigType): Dayjs {
  return (value === undefined ? dayjs() : dayjs(value)).tz(STORE_TZ)
}

/** 门店的今天，YYYY-MM-DD */
export function storeToday(): string {
  return storeTime().format('YYYY-MM-DD')
}

/**
 * 门店今天对应的「日期对象」，给日期选择器和快捷区间用：取门店日期、按本地零点构造，
 * 选择器显示和 format('YYYY-MM-DD') 得到的都是门店日期。
 */
export function storeDay(): Dayjs {
  return dayjs(storeToday())
}
