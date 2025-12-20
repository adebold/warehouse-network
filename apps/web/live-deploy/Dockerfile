FROM node:18-alpine
WORKDIR /app
COPY app-simple.js package-simple.json ./
COPY package-simple.json ./package.json
RUN npm install
EXPOSE 8080
ENV PORT=8080
CMD ["npm", "start"]