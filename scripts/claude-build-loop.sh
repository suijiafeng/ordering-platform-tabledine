#!/usr/bin/env bash
# 本地构建协作脚本：在本机终端运行一次，循环等待 .claude-build/request 文件中的 Maven 目标并执行，
# 输出写入 .claude-build/output.log。只会执行 mvn（目标由 request 文件给出），不会执行其他命令。
# 另外支持两个特殊请求：
#   @restart  —— 以 dev profile 在后台重启后端（mvn spring-boot:run），日志写到 .claude-build/app.log
#   @stop     —— 停止后台后端
# 按 Ctrl+C 退出。
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/.claude-build"
mkdir -p "$WORK"

# ---- 选择 JDK 17+ ----
pick_java_home() {
  if [ -n "${JAVA_HOME:-}" ] && "$JAVA_HOME/bin/java" -version 2>&1 | grep -Eq 'version "(1[7-9]|2[0-9])'; then
    echo "$JAVA_HOME"; return
  fi
  if [ -x /usr/libexec/java_home ]; then
    for v in 21 17; do
      h=$(/usr/libexec/java_home -v "$v" 2>/dev/null) && [ -n "$h" ] && { echo "$h"; return; }
    done
  fi
  # IDEA 下载的 JDK
  for d in "$HOME"/Library/Java/JavaVirtualMachines/*/Contents/Home; do
    [ -x "$d/bin/java" ] && "$d/bin/java" -version 2>&1 | grep -Eq 'version "(1[7-9]|2[0-9])' && { echo "$d"; return; }
  done
}
# ---- 选择 Maven（PATH 里的，或 IDEA 自带的）----
pick_mvn() {
  if command -v mvn >/dev/null 2>&1; then command -v mvn; return; fi
  for d in /Applications/IntelliJ\ IDEA*.app "$HOME"/Applications/IntelliJ\ IDEA*.app "$HOME"/Applications/JetBrains\ Toolbox/*IDEA*.app; do
    m="$d/Contents/plugins/maven/lib/maven3/bin/mvn"
    [ -x "$m" ] && { echo "$m"; return; }
  done
}

JH=$(pick_java_home); MVN=$(pick_mvn)
if [ -z "$JH" ]; then echo "未找到 JDK 17+，请先在 IDEA 里下载一个（Project Structure → SDK → Download JDK）"; exit 1; fi
if [ -z "$MVN" ]; then echo "未找到 Maven（PATH 或 IntelliJ IDEA 自带）"; exit 1; fi
export JAVA_HOME="$JH"
echo "JAVA_HOME=$JAVA_HOME"
echo "MVN=$MVN"
"$JAVA_HOME/bin/java" -version 2>&1 | head -1
echo "等待构建请求中…（Ctrl+C 退出）"

APP_PID=""
stop_app() {
  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    pkill -P "$APP_PID" 2>/dev/null; kill "$APP_PID" 2>/dev/null; wait "$APP_PID" 2>/dev/null
  fi
  APP_PID=""
  # 兜底：占用 8080 的 java 进程
  lsof -ti tcp:8080 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
}
trap 'stop_app; echo; echo "已退出"; exit 0' INT TERM

while true; do
  if [ -f "$WORK/request" ]; then
    req=$(cat "$WORK/request"); rm -f "$WORK/request" "$WORK/done"
    echo "[$(date '+%H:%M:%S')] 请求: $req"
    case "$req" in
      @stop)
        stop_app; echo "后端已停止" > "$WORK/output.log"; echo "exit=0" >> "$WORK/output.log" ;;
      @restart)
        stop_app
        : > "$WORK/app.log"
        ( cd "$ROOT/server" && exec "$MVN" -q -B spring-boot:run -Dspring-boot.run.profiles=dev ) >> "$WORK/app.log" 2>&1 &
        APP_PID=$!
        echo "后端启动中 pid=$APP_PID，日志 .claude-build/app.log" > "$WORK/output.log"; echo "exit=0" >> "$WORK/output.log" ;;
      *)
        # 只允许 Maven 目标/参数，拒绝任何 shell 元字符
        if printf '%s' "$req" | grep -q '[;&|`$<>()]'; then
          echo "拒绝执行：请求含非法字符" > "$WORK/output.log"; echo "exit=99" >> "$WORK/output.log"
        else
          # shellcheck disable=SC2086
          ( cd "$ROOT/server" && "$MVN" -B $req ) > "$WORK/output.log" 2>&1
          echo "exit=$?" >> "$WORK/output.log"
        fi ;;
    esac
    touch "$WORK/done"
    echo "[$(date '+%H:%M:%S')] 完成: $(tail -1 "$WORK/output.log")"
  fi
  sleep 1
done
