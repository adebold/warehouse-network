const express = require('express');
const { logger } = require('./utils/logger');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>AI Industries - Warehouse Network</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0a0a0a;
          color: #fff;
          min-height: 100vh;
        }
        .hero {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
          position: relative;
          overflow: hidden;
        }
        .hero::before {
          content: '';
          position: absolute;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(67, 56, 202, 0.1) 0%, transparent 70%);
          animation: pulse 4s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1.2); opacity: 0.8; }
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px;
          text-align: center;
          position: relative;
          z-index: 1;
        }
        h1 {
          font-size: 72px;
          font-weight: 900;
          margin-bottom: 20px;
          background: linear-gradient(135deg, #4338ca 0%, #7c3aed 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -2px;
        }
        .subtitle {
          font-size: 24px;
          color: #94a3b8;
          margin-bottom: 40px;
          font-weight: 300;
        }
        .status {
          display: inline-block;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid #22c55e;
          color: #22c55e;
          padding: 12px 24px;
          border-radius: 50px;
          font-size: 16px;
          margin-bottom: 60px;
        }
        .features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 30px;
          margin-top: 80px;
        }
        .feature {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 40px;
          border-radius: 20px;
          transition: all 0.3s;
        }
        .feature:hover {
          background: rgba(255, 255, 255, 0.05);
          transform: translateY(-5px);
          border-color: #4338ca;
        }
        .feature-icon {
          font-size: 48px;
          margin-bottom: 20px;
        }
        .feature h3 {
          font-size: 24px;
          margin-bottom: 15px;
          color: #fff;
        }
        .feature p {
          color: #94a3b8;
          line-height: 1.6;
        }
        .cta {
          margin-top: 80px;
        }
        .btn {
          display: inline-block;
          padding: 16px 40px;
          background: linear-gradient(135deg, #4338ca 0%, #7c3aed 100%);
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 18px;
          transition: all 0.3s;
          margin: 0 10px;
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(67, 56, 202, 0.4);
        }
        .btn-secondary {
          background: transparent;
          border: 2px solid #4338ca;
        }
        .footer {
          margin-top: 100px;
          padding-top: 40px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          color: #64748b;
        }
      </style>
    </head>
    <body>
      <div class="hero">
        <div class="container">
          <h1>AI Industries</h1>
          <p class="subtitle">Next-Generation Warehouse Management Platform</p>
          <div class="status">✅ Live on Google Cloud</div>
          
          <div class="features">
            <div class="feature">
              <div class="feature-icon">🤖</div>
              <h3>AI-Powered Operations</h3>
              <p>Leverage artificial intelligence to optimize warehouse workflows and predict demand patterns.</p>
            </div>
            <div class="feature">
              <div class="feature-icon">📊</div>
              <h3>Real-Time Analytics</h3>
              <p>Monitor performance metrics and make data-driven decisions with live dashboards.</p>
            </div>
            <div class="feature">
              <div class="feature-icon">🚀</div>
              <h3>Scalable Infrastructure</h3>
              <p>Built on Google Cloud for unlimited scalability and 99.9% uptime guarantee.</p>
            </div>
          </div>
          
          <div class="cta">
            <a href="/api/health" class="btn">API Status</a>
            <a href="#" class="btn btn-secondary">Learn More</a>
          </div>
          
          <div class="footer">
            <p>© 2024 AI Industries • Powered by Google Cloud Run</p>
            <p style="margin-top: 10px; font-size: 14px;">Project: aindustries-warehouse • Region: us-central1</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'AI Industries Warehouse Network',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: {
      project: 'aindustries-warehouse',
      region: 'us-central1',
      platform: 'Google Cloud Run'
    }
  });
});

app.listen(PORT, () => {
  logger.info(\`AI Industries Warehouse Network running on port \${PORT}\`);
});