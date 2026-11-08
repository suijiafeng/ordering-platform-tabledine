import { Alert } from 'antd'

/** 后台读取失败不打断操作，也不能让旧数据看起来仍是最新。 */
export default function SyncStatus({ failed }: { failed: boolean }) {
  return failed ? <Alert style={{ marginBottom: 16 }} type="warning" showIcon message="数据同步暂时中断，当前显示上次结果；网络恢复后将自动更新" /> : null
}
