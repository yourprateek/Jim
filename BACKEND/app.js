require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', require('./routes/api'));
app.use('/api', (req, res) => res.status(404).json({ error: { message: 'Route not found' } }));

// global error handler: one JSON format, never leaks stack traces
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { message: 'Invalid JSON' } });
  if (err.status) return res.status(err.status).json({ error: { message: err.message } });
  console.error(err);
  res.status(500).json({ error: { message: 'Something went wrong' } });
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((e) => { console.error('MongoDB failed:', e.message); process.exit(1); });

module.exports = app;
