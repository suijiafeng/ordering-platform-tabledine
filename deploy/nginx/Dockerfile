# 前端镜像：在镜像里构建商家后台和顾客 H5，再交给 nginx 提供静态文件并反向代理后端。
# 构建上下文是仓库根目录（见 docker-compose.yml），服务器上不需要安装 Node。

# ---- 构建商家后台 ----
FROM node:20-alpine AS merchant
WORKDIR /app
COPY merchant-web/package.json merchant-web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY merchant-web/ ./
RUN npm run build

# ---- 构建顾客 H5（静态导出，部署在 /h5）----
FROM node:20-alpine AS customer
WORKDIR /app
COPY customer-web/package.json customer-web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY customer-web/ ./
ENV STATIC_EXPORT=true
RUN npm run build

# ---- 运行 ----
FROM nginx:1.27-alpine
# nginx 官方镜像启动时会把 /etc/nginx/templates/*.template 用环境变量渲染到 /etc/nginx/conf.d/
COPY deploy/nginx/templates/ /etc/nginx/templates/
COPY deploy/nginx/includes/ /etc/nginx/includes/
COPY --from=merchant /app/dist /usr/share/nginx/merchant
COPY --from=customer /app/out /usr/share/nginx/h5
