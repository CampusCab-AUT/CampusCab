require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const tripRoutes = require('./routes/tripRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const messageRoutes = require('./routes/messageRoutes');
const reportRoutes = require('./routes/reportRoutes');
const userRoutes = require('./routes/userRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin/reports', reportRoutes);
app.use('/api/admin/users', userRoutes);
app.use('/api/admin/audit-logs', auditLogRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'CampusCab API is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CampusCab server running on port ${PORT}`);
});

module.exports = app;
