FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including bcryptjs and date-fns)
RUN npm install

# Copy application files
COPY . .

# Generate Prisma client
RUN npx prisma generate || true

# Set environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN npm run build

# Expose port
EXPOSE 8080
ENV PORT=8080

# Start the application
CMD ["npm", "start"]