const express = require('express');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/posts', require('./routes/postRoutes'));
// /api/auth mounts here in step 4; the centralized error handler is appended
// after all routes in step 5.

module.exports = app;
