const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Warehouse Network - Live</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
        .container { max-width: 800px; margin: 50px auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #0066cc; margin-bottom: 20px; }
        .status { background: #d4edda; color: #155724; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .features { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        li { margin: 10px 0; }
        .btn { display: inline-block; background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        .btn:hover { background: #0052a3; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🏭 Warehouse Network</h1>
        <div class="status">
          ✅ Successfully Deployed on Google Cloud Run!
        </div>
        
        <h2>Application Status</h2>
        <div class="features">
          <ul>
            <li>✓ Cloud Run Service: Active</li>
            <li>✓ Region: us-central1</li>
            <li>✓ Project: ${process.env.K_SERVICE || 'warehouse-network'}</li>
            <li>✓ Revision: ${process.env.K_REVISION || 'latest'}</li>
            <li>✓ Health Check: <a href="/api/health">Check Status</a></li>
          </ul>
        </div>
        
        <p>The full Next.js application with all features is ready to be deployed. This placeholder confirms your Cloud Run infrastructure is working correctly.</p>
        
        <a href="/api/health" class="btn">Check API Health</a>
      </div>
    </body>
    </html>
  `);
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'warehouse-network',
    environment: process.env.NODE_ENV || 'production',
    cloudRun: {
      service: process.env.K_SERVICE,
      revision: process.env.K_REVISION,
      configuration: process.env.K_CONFIGURATION
    }
  });
});

app.listen(PORT, () => {
  console.log(\`✅ Warehouse Network running on port \${PORT}\`);
});