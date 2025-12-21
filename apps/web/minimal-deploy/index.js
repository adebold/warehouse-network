// Minimal deployment to test
const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Warehouse Network</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .hero { background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); color: white; padding: 4rem 2rem; text-align: center; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { font-size: 3rem; margin-bottom: 1rem; }
        .search-box { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin: 3rem auto; max-width: 800px; }
        .search-form { display: flex; gap: 1rem; }
        input { flex: 1; padding: 1rem; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 1rem; }
        button { padding: 1rem 2rem; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; }
        button:hover { background: #2563eb; }
        .features { padding: 4rem 2rem; }
        .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; margin-top: 2rem; }
        .feature-card { text-align: center; padding: 2rem; }
        .feature-icon { width: 64px; height: 64px; margin: 0 auto 1rem; background: #eff6ff; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .cta { background: #3b82f6; color: white; padding: 4rem 2rem; text-align: center; }
        .cta h2 { font-size: 2rem; margin-bottom: 1rem; }
        .cta-button { display: inline-block; padding: 1rem 2rem; background: white; color: #3b82f6; text-decoration: none; border-radius: 6px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="hero">
        <div class="container">
          <h1>Find Your Perfect Warehouse Space</h1>
          <p style="font-size: 1.25rem; opacity: 0.9;">Connect with trusted warehouse providers across the nation</p>
        </div>
      </div>

      <div class="container">
        <div class="search-box">
          <form class="search-form">
            <input type="text" placeholder="What are you looking for?" />
            <input type="text" placeholder="Location" />
            <button type="submit">Search</button>
          </form>
        </div>
      </div>

      <div class="features">
        <div class="container">
          <h2 style="text-align: center; font-size: 2rem; margin-bottom: 1rem;">Why Choose Warehouse Network?</h2>
          <div class="feature-grid">
            <div class="feature-card">
              <div class="feature-icon">✓</div>
              <h3>Verified Providers</h3>
              <p>All warehouse providers are thoroughly vetted for quality and reliability</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">$</div>
              <h3>Transparent Pricing</h3>
              <p>No hidden fees. Compare prices and features easily</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">⚡</div>
              <h3>Fast & Easy</h3>
              <p>Find and book warehouse space in minutes, not days</p>
            </div>
          </div>
        </div>
      </div>

      <div class="cta">
        <div class="container">
          <h2>Ready to Find Your Warehouse?</h2>
          <p style="margin-bottom: 2rem;">Join thousands of businesses that trust Warehouse Network</p>
          <a href="/search" class="cta-button">Start Searching Now</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});