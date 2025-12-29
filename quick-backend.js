const express = require('express');
const cors = require('cors');
const { logger } = require('./utils/logger');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'warehouse-backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
  });
});

// API Routes
app.get('/api/warehouses', (req, res) => {
  res.json([
    { id: 1, name: 'Main Warehouse', location: 'New York', capacity: 10000, status: 'Active' },
    { id: 2, name: 'East Coast Hub', location: 'Atlanta', capacity: 8000, status: 'Active' },
    { id: 3, name: 'West Coast Hub', location: 'Los Angeles', capacity: 12000, status: 'Active' },
  ]);
});

app.get('/api/inventory', (req, res) => {
  res.json([
    {
      id: 1,
      sku: 'WH001',
      name: 'Storage Unit A',
      quantity: 150,
      warehouseId: 1,
      status: 'Available',
    },
    {
      id: 2,
      sku: 'WH002',
      name: 'Storage Unit B',
      quantity: 89,
      warehouseId: 2,
      status: 'Available',
    },
    {
      id: 3,
      sku: 'WH003',
      name: 'Storage Unit C',
      quantity: 203,
      warehouseId: 3,
      status: 'Available',
    },
  ]);
});

app.get('/api/status', (req, res) => {
  res.json({
    application: 'Warehouse Network Backend',
    status: 'LIVE',
    version: '1.0.0',
    services: ['warehouses', 'inventory', 'health'],
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  logger.info(`🚀 Warehouse Backend API running on port ${PORT}`);
});
