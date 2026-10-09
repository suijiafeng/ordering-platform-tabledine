# 顾客 H5 下单端

基于 Next.js App Router（静态导出）、antd-mobile 和 zustand，复用现有 `/api/v1/c/**` 顾客接口；
业务规则：扫码浏览不需登录，提交订单时登录会员账号，余额支付。

```bash
npm install
npm run dev        # http://127.0.0.1:3000/?token=dev-table-a1
npm run lint       # ESLint（与 merchant-web 同一套规则）
npm run typecheck
```

开发服务器将 `/api` 和 `/uploads` 代理到 `API_PROXY_TARGET`（默认 `http://127.0.0.1:8080`）。
开发种子会员：`13800000001 / staff123`。

## 页面

| 路径 | 说明 |
| --- | --- |
| `/?token=…`、`/q/<token>` | 菜单：分类与菜品滚动联动、分类角标、搜索、菜品详情、规格弹层、购物车、进行中订单入口；回到前台超过 1 分钟自动刷新营业状态与菜单；站内回到无 token 的 `/` 时沿用已扫的桌台 |
| `/checkout` | 确认订单：未登录先登录再回来（保留人数、备注）；显示余额，余额不足不创建订单；`clientRequestId` 幂等，下单后余额支付；售罄 / 下架 / 打烊 / 桌码失效时回菜单重新加载 |
| `/order?orderNo=…` | 订单详情：未结束的订单每 5 秒刷新（页面不可见时暂停，操作后重新开始）；支付、取消、申请 / 撤回退款 |
| `/orders` | 我的订单：全部 / 进行中 / 已结束筛选，下拉刷新、触底加载、待支付倒计时 |
| `/me` | 余额、流水（分页）、修改密码、退出登录 |
| `/login` | 会员登录；回跳地址只允许站内路径 |

## 约定

- 错误处理：请求层统一提示；页面用 `ignoreShownError(e)` 只忽略已提示的 `ApiError`，其他异常继续抛出（见 `docs/编码规范.md`）
- Next.js App Router 自带 React 19：antd-mobile 的命令式弹层通过 `components/AntdMobileCompat.tsx` 改用 `createRoot`

## 部署

```bash
STATIC_EXPORT=true npm run build
```

产物位于 `out/`，由 Nginx 在 `/h5/` 提供，与后端 API 同域。生产部署时 `deploy/nginx/Dockerfile` 会在镜像里执行这一步，不需要手动构建。
