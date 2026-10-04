# ---- 构建阶段 ----
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
# checkstyle.xml 必须一起拷进来：pom 把 checkstyle:check 绑在 validate 阶段，
# 缺这个文件 package 会直接失败（configLocation 找不到）
COPY pom.xml checkstyle.xml ./
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B -DskipTests package

# ---- 运行阶段 ----
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data/uploads && chown app:app /data/uploads
COPY --from=build /app/target/ordering-server-*.jar /app/app.jar
USER app
EXPOSE 8080
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -Duser.timezone=Asia/Shanghai"
# 镜像默认生产配置；忘记设置时也不会以开发模式（开发密钥、开发种子数据）启动
ENV SPRING_PROFILES_ACTIVE=prod
HEALTHCHECK --interval=15s --timeout=3s --start-period=40s --retries=5 \
  CMD wget -qO- http://localhost:8080/actuator/health || exit 1
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
