import Taro from '@tarojs/taro'

/** 无图标的轻提示。只是展示，调用方不需要等待它完成。H5 端 duration 必须是数字，统一给默认值 */
export function toast(title: string, duration = 1500): void {
  Taro.showToast({ title, icon: 'none', duration }).catch(() => {
    // 展示失败（如页面切换中）不影响业务
  })
}
