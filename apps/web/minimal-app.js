const express = require('express');
const { logger } = require('./utils/logger');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.json({
    message: 'Warehouse Network API',
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
