FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
# 화장실 데이터는 /app/data 에 저장 (볼륨 연결 권장)
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server/index.js"]
