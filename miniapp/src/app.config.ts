export default defineAppConfig({
  pages: process.env.TARO_ENV === 'h5' ? ['pages/index/index'] : [
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
