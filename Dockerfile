# ⚠️ 已停用（1.3.0）：HTTP 模式由 Lalaleap 後端（.NET）內建提供，不再需要部署本容器。
# 以此映像啟動（LALALEAP_TRANSPORT=http）會印出停用訊息並以非 0 結束。保留檔案僅供參考。
#
# Lalaleap MCP Server — HTTP（OAuth Resource Server）模式
#
# build:  docker build -t lalaleap-mcp:1.2.0 .
# run:    docker run -d --name lalaleap-mcp -p 3000:3000 \
#           -e MCP_PUBLIC_URL=https://mcp.lalaleap.twkuraki.com/mcp \
#           -e OAUTH_ISSUER=https://lalaleap.twkuraki.com/ap2/lalaleap/oauth \
#           -e LALALEAP_API_URL=https://lalaleap.twkuraki.com/ap2/lalaleap \
#           -e MCP_ALLOWED_HOSTS=mcp.lalaleap.twkuraki.com \
#           -e OAUTH_RS_CLIENT_ID=lalaleap-mcp-rs \
#           -e OAUTH_RS_CLIENT_SECRET=<secret，建議用 docker secrets／--env-file，不要寫進映像> \
#           lalaleap-mcp:1.2.0
# 完整環境變數與反向代理需求見 README.md「HTTP 模式」與前端 repo docs/specs/mcp_oauth/DEPLOY.md

# ---- builder：安裝全部依賴並編譯 ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts：略過 prepare（它會在 src 尚未複製前就跑 tsc）
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime：只帶 production 依賴與 dist ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    LALALEAP_TRANSPORT=http \
    PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/dist ./dist

# 非 root 執行（node 映像內建 node 使用者）
USER node
EXPOSE 3000

# /healthz 不驗 Host、不打授權伺服器，只代表程序存活
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
