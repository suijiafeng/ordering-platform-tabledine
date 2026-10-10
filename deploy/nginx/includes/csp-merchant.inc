# 商家后台（Vite 产物，没有内联脚本）：脚本只允许本站文件。
# 两个前端的 token 都存在 localStorage，XSS 的后果是会话被盗，CSP 是主要缓解层。
# antd 用 CSS-in-JS 注入 <style>，style-src 需要 'unsafe-inline'；img 允许 data:（桌码二维码）与 blob:（上传预览）。
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
