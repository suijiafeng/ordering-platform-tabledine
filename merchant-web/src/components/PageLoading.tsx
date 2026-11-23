import { Spin } from 'antd'

/** 路由懒加载时的占位：页面代码下载完之前显示 */
export default function PageLoading() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
      <Spin />
    </div>
  )
}
