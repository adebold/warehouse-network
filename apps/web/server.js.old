const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Warehouse Network</title>
      <style>
        body { font-family: Arial; padding: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #0066cc; }
        .status { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .features { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
        li { margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🏭 Warehouse Network - Successfully Deployed!</h1>
        <div class="status">
          ✅ Your application is now publicly accessible without authentication!
        </div>
        
        <h2>Implemented Features:</h2>
        <div class="features">
          <ul>
            <li>✓ Complete Design System with 15+ UI Components</li>
            <li>✓ Payment Control System with Account Locking</li>
            <li>✓ Comprehensive Test Suite</li>
            <li>✓ Authentication System</li>
            <li>✓ Health Monitoring</li>
            <li>✓ Cloud Run Deployment</li>
          </ul>
        </div>
        
        <p>The full Next.js application is being built. This is a placeholder to verify deployment works.</p>
        <p>Project: ${process.env.GCP_PROJECT || 'warehouse-adebold-202512191452'}</p>
        <p>Region: us-central1</p>
      </div>
    </body>
    </html>
  `);
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'warehouse-app'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});