FROM node:20-alpine

WORKDIR /app

COPY global-bundle.pem /app/global-bundle.pem

COPY package*.json ./

RUN npm install

RUN apk add --no-cache mongodb-tools

COPY . .

EXPOSE 4000

CMD ["npx", "ts-node", "--transpile-only", "-r", "tsconfig-paths/register", "src/index.ts"]