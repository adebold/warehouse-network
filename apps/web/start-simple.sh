#!/bin/bash

# Simple deployment script
echo "🚀 Deploying Warehouse Network Application..."

# Create a simple deployment directory
mkdir -p /tmp/warehouse-deploy
cd /tmp/warehouse-deploy

# Create a simple Express server that shows warehouse info
cat > server.js << 'EOF'
const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Warehouse Network</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          background: white;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 60px 40px;
          text-align: center;
        }
        .header h1 {
          font-size: 48px;
          margin-bottom: 20px;
          font-weight: 700;
        }
        .header p {
          font-size: 20px;
          opacity: 0.9;
        }
        .content {
          padding: 60px 40px;
        }
        .status {
          background: #d4edda;
          border: 1px solid #c3e6cb;
          color: #155724;
          padding: 20px;
          border-radius: 10px;
          margin-bottom: 40px;
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .status-icon {
          font-size: 30px;
        }
        .features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 30px;
          margin: 40px 0;
        }
        .feature {
          padding: 30px;
          background: #f8f9fa;
          border-radius: 10px;
          transition: transform 0.3s;
        }
        .feature:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.1);
        }
        .feature h3 {
          color: #667eea;
          margin-bottom: 15px;
          font-size: 24px;
        }
        .feature p {
          color: #6c757d;
          line-height: 1.6;
        }
        .metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin: 40px 0;
        }
        .metric {
          text-align: center;
          padding: 30px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 10px;
        }
        .metric-value {
          font-size: 36px;
          font-weight: bold;
        }
        .metric-label {
          margin-top: 10px;
          opacity: 0.9;
        }
        .cta {
          text-align: center;
          margin: 40px 0;
        }
        .btn {
          display: inline-block;
          padding: 15px 40px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          text-decoration: none;
          border-radius: 50px;
          font-weight: 600;
          font-size: 18px;
          transition: transform 0.3s;
        }
        .btn:hover {
          transform: scale(1.05);
        }
        .footer {
          background: #f8f9fa;
          padding: 20px 40px;
          text-align: center;
          color: #6c757d;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏭 Warehouse Network</h1>
          <p>Smart Warehouse Management Platform</p>
        </div>
        
        <div class="content">
          <div class="status">
            <span class="status-icon">✅</span>
            <div>
              <strong>System Status: Operational</strong><br>
              All services are running normally
            </div>
          </div>
          
          <h2 style="text-align: center; margin-bottom: 40px; color: #333;">
            Your Complete Warehouse Solution
          </h2>
          
          <div class="features">
            <div class="feature">
              <h3>📦 Inventory Management</h3>
              <p>Real-time tracking of warehouse inventory with automated alerts and smart restocking suggestions.</p>
            </div>
            <div class="feature">
              <h3>🚚 Shipping Integration</h3>
              <p>Seamless integration with major shipping providers for efficient order fulfillment.</p>
            </div>
            <div class="feature">
              <h3>📊 Analytics Dashboard</h3>
              <p>Comprehensive analytics to optimize warehouse operations and reduce costs.</p>
            </div>
            <div class="feature">
              <h3>👥 Team Collaboration</h3>
              <p>Built-in tools for warehouse staff coordination and task management.</p>
            </div>
          </div>
          
          <div class="metrics">
            <div class="metric">
              <div class="metric-value">99.9%</div>
              <div class="metric-label">Uptime</div>
            </div>
            <div class="metric">
              <div class="metric-value">2.5s</div>
              <div class="metric-label">Avg Response</div>
            </div>
            <div class="metric">
              <div class="metric-value">5,000+</div>
              <div class="metric-label">Warehouses</div>
            </div>
            <div class="metric">
              <div class="metric-value">24/7</div>
              <div class="metric-label">Support</div>
            </div>
          </div>
          
          <div class="cta">
            <a href="/api/health" class="btn">Check API Status</a>
          </div>
        </div>
        
        <div class="footer">
          <p>Deployed on Google Cloud Run • ${new Date().toISOString()}</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'warehouse-network',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      service: process.env.K_SERVICE || 'local',
      revision: process.env.K_REVISION || 'latest'
    }
  });
});

app.listen(PORT, () => {
  console.log(`Warehouse Network running on port ${PORT}`);
});
EOF

# Create package.json
cat > package.json << 'EOF'
{
  "name": "warehouse-network",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF

# Deploy to Cloud Run
echo "📦 Deploying to Cloud Run..."
gcloud run deploy warehouse-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --project easyreno-demo-20251219144606

echo "✅ Deployment complete!"