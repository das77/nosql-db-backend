const express = require('express');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes are mounted here in later steps, e.g.:
// app.use('/api/posts', require('./routes/postRoutes'));

module.exports = app;
