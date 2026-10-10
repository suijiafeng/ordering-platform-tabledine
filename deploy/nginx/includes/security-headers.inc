# 通用安全响应头。nginx 的 add_header 不继承：location 里只要写了任意 add_header（如 Cache-Control），
# server 级的头就全部失效，所以这些头做成 include，在 server 和每个有 add_header 的 location 里都引一次。
# always：4xx / 5xx 响应也带上。
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
