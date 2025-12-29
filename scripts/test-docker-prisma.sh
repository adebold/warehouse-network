#!/bin/bash

echo "🧪 Testing Prisma connection from Docker app container..."

# Test 1: Check if app container can connect to database
echo -e "\n📡 Test 1: Testing database connection from app container..."
docker exec warehouse-app sh -c "cd apps/web && npx prisma db pull --print"

# Test 2: Run a simple Prisma query
echo -e "\n📊 Test 2: Testing Prisma query execution..."
docker exec warehouse-app sh -c "cd apps/web && node -e \"
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const userCount = await prisma.user.count();
    const operatorCount = await prisma.operator.count();
    const warehouseCount = await prisma.warehouse.count();
    
    console.log('✅ Prisma connection successful!');
    console.log('- Users:', userCount);
    console.log('- Operators:', operatorCount);
    console.log('- Warehouses:', warehouseCount);
  } catch (error) {
    console.error('❌ Prisma connection failed:', error.message);
  } finally {
    await prisma.\\\$disconnect();
  }
}

test();
\""

# Test 3: Check DATABASE_URL in container
echo -e "\n🔐 Test 3: Checking DATABASE_URL configuration..."
docker exec warehouse-app sh -c "echo \$DATABASE_URL | sed 's/:.*@/:****@/g'"

echo -e "\n✨ Docker Prisma tests completed!"