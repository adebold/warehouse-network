#!/usr/bin/env node
const https = require('https');

function checkDeployment() {
  const url = 'https://warehouse-frontend-467296114824.us-central1.run.app/';
  console.log(new Date().toISOString(), '- Checking deployment status...');
  
  https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const hasNextJs = data.includes('Find Your Perfect Warehouse Space') || 
                       data.includes('__NEXT_DATA__') || 
                       data.includes('_next/static');
      const hasStatic = data.includes('Warehouse Network') && !hasNextJs;
      
      console.log('Status:', res.statusCode, '| Type:', 
        hasNextJs ? 'NEXT.JS DEPLOYED! 🎉' : 
        hasStatic ? 'Static HTML' : 
        'Unknown');
        
      if (hasNextJs) {
        console.log('🚨 ALERT: BEAUTIFUL WAREHOUSE PLATFORM IS LIVE! 🚨');
        console.log('✅ Beautiful Next.js application successfully deployed');
        console.log('🏭 Find Your Perfect Warehouse Space is now operational');
        console.log('🔗 URL: ' + url);
        process.exit(0);
      }
    });
  }).on('error', err => {
    console.error('Error:', err.message);
  });
}

// Check immediately, then every 15 seconds for 5 minutes
checkDeployment();
const interval = setInterval(checkDeployment, 15000);
setTimeout(() => {
  console.log('⏰ Monitoring period completed - deployment still in progress');
  clearInterval(interval);
  process.exit(1);
}, 300000); // 5 minutes