# 顾客 H5（Next.js 静态导出）：框架会在 HTML 里写内联脚本传递 hydration 数据，静态导出无法加 nonce，
# 所以 script-src 需要 'unsafe-inline'（仍禁止加载外站脚本）。其余与商家端一致。
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
