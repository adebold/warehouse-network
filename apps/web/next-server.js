// Simple Next.js server
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { logger } = require('./utils/logger');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const port = process.env.PORT || 3000;

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, err => {
    if (err) throw err;
    logger.info(`> Ready on http://localhost:${port}`);
  });
});
