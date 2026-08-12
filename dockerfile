FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY --chown=node:node . .

RUN npx prisma generate

USER node

EXPOSE 3000

CMD ["npm", "run", "dev"]