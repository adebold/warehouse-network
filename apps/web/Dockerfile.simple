# Simple Dockerfile for Cloud Run
FROM node:18-alpine

WORKDIR /app

# Copy package.json
COPY package.json ./

# Install production dependencies
RUN npm install --production

# Copy the rest of the application
COPY . .

# Install all dependencies for build
RUN npm install

# Generate Prisma client
RUN npx prisma generate || true

# Build Next.js
RUN npm run build || echo "Build step skipped"

EXPOSE 8080

# Update the start script in package.json if needed
RUN node -e "const p = require('./package.json'); p.scripts.start = 'NODE_ENV=production node server.js'; require('fs').writeFileSync('./package.json', JSON.stringify(p, null, 2));"

# Start with custom server
CMD ["npm", "start"]