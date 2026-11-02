const mongoose = require('mongoose');
const { createApp } = require('./app');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/student_analytics';
const PORT = process.env.PORT || 3000;

mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => createApp().listen(PORT, () => console.log(`Connected to ${MONGO_URI}\nServer running at http://127.0.0.1:${PORT}`)))
  .catch((e) => { console.error('Could not connect to MongoDB. Is it running?\n' + e.message); process.exit(1); });
