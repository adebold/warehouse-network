const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Warehouse Network - Cloud Run</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { color: #0066cc; }
          .status { background: #f0f8ff; padding: 20px; border-radius: 8px; }
        </style>
      </head>
      <body>
        <h1>🚀 Warehouse Network on Cloud Run</h1>
        <div class="status">
          <p><strong>Status:</strong> Application deployed successfully!</p>
          <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
          <p><strong>Project:</strong> ${process.env.PROJECT_ID || 'Not set'}</p>
        </div>
        <p>This is a minimal deployment to verify Cloud Run is working.</p>
        <p>Next steps:</p>
        <ul>
          <li>Deploy the full Next.js application</li>
          <li>Set up Cloud SQL database</li>
          <li>Configure environment variables</li>
        </ul>
      </body>
    </html>
  `);
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
