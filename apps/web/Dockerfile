# Simple working Dockerfile for Next.js
FROM node:18-alpine

WORKDIR /app

# Copy all files
COPY . .

# Install dependencies
RUN npm install

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Expose port
EXPOSE 3000

# Start production server
ENV NODE_ENV production
ENV PORT 3000
CMD ["npm", "start"]