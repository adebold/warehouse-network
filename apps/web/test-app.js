const express = require('express');
const { logger } = require('./utils/logger');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send('Warehouse Network - Test Deployment Working!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
