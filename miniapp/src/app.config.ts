export default defineAppConfig({
  // H5：完整点餐 + 会员登录 / 我的（余额）；小程序没有密码登录，不含这两页
  pages: process.env.TARO_ENV === 'h5' ? [
    'pages/index/index',
    'pages/checkout/index',
    'pages/order-list/index',
    'pages/order-detail/index',
    'pages/login/index',
    'pages/me/index',
  ] : [
    'pages/index/index',
    'pages/checkout/index',
    'pages/order-list/index',
    'pages/order-detail/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '扫码点餐',
    navigationBarTextStyle: 'black',
  },
})
