# Development Dockerfile with hot reload
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose ports (app + debugger)
EXPOSE 3000 9229

# Enable hot reload
ENV NODE_ENV=development
ENV CHOKIDAR_USEPOLLING=true

# Start development server with debugging
CMD ["npm", "run", "dev"]