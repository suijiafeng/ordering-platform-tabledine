export default defineAppConfig({
  pages: [
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
