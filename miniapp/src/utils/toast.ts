import Taro from '@tarojs/taro'

/** 无图标的轻提示。只是展示，调用方不需要等待它完成 */
export function toast(title: string, duration?: number): void {
  void Taro.showToast({ title, icon: 'none', duration })
}
