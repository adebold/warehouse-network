const express = require('express');
const { logger } = require('./utils/logger');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Warehouse Network - Cloud Run Test</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; background: #f5f5f5; }
          .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          h1 { color: #0066cc; }
          .status { background: #e8f4f8; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .success { color: #28a745; font-weight: bold; }
          .info { color: #666; margin: 10px 0; }
          ul { line-height: 1.8; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🚀 Warehouse Network on Cloud Run</h1>
          <div class="status">
            <p class="success">✅ Deployment Successful!</p>
            <p class="info">Environment: ${process.env.NODE_ENV || 'development'}</p>
            <p class="info">Project: ${process.env.GCP_PROJECT || 'easyreno-poc-202512161545'}</p>
            <p class="info">Region: us-central1</p>
            <p class="info">Time: ${new Date().toISOString()}</p>
          </div>
          <h2>Next Steps:</h2>
          <ul>
            <li>✅ Cloud Run deployment verified</li>
            <li>📦 Deploy the full Next.js application</li>
            <li>🗄️ Set up Cloud SQL database</li>
            <li>🔐 Configure environment variables</li>
            <li>🌐 Set up custom domain (optional)</li>
          </ul>
          <p>API Health Check: <a href="/api/health">/api/health</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
