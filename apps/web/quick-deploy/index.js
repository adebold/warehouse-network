const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

// Basic warehouse app
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Warehouse Network</title>
        <style>
          body { font-family: -apple-system, sans-serif; margin: 0; padding: 40px; background: #f5f5f5; }
          .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          h1 { color: #333; margin-bottom: 10px; }
          .status { color: #22c55e; font-weight: 600; }
          .info { margin: 20px 0; padding: 20px; background: #f0f9ff; border-radius: 6px; }
          .metric { display: inline-block; margin-right: 30px; }
          .metric strong { display: block; font-size: 24px; color: #1e40af; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Warehouse Network</h1>
          <p class="status">✓ Operational</p>
          <div class="info">
            <h2>System Status</h2>
            <div class="metric">
              <strong>100%</strong>
              <span>Uptime</span>
            </div>
            <div class="metric">
              <strong>Active</strong>
              <span>Status</span>
            </div>
            <div class="metric">
              <strong>${new Date().toLocaleDateString()}</strong>
              <span>Date</span>
            </div>
          </div>
          <p>Project: warehouse-network-20251220</p>
          <p>Environment: Production</p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Warehouse app listening on port ${PORT}`);
});