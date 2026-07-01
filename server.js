import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { JSONDatabase } from './src/db.js';
import { parseUA } from './src/uaParser.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_ROUTE = process.env.ADMIN_ROUTE || '/admin';

// Initialize JSON database
const db = new JSONDatabase(path.join(__dirname, 'data', 'visits.json'));

// Trust proxy for accurate client IP detection behind proxies
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to check admin authorization
function isAuthorized(req) {
  const password = req.headers['x-admin-password'];
  return password === ADMIN_PASSWORD;
}

// API Routes

// 1. Verify admin password
app.post('/api/verify-password', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, error: 'Invalid password' });
});

// 2. Log a visit (or update an existing one with precise GPS details)
app.post('/api/log-visit', async (req, res) => {
  try {
    const clientData = req.body || {};

    // Check if updating an existing record with precise GPS/Address
    if (clientData.id) {
      const updatedFields = {
        latitude: parseFloat(clientData.latitude) || null,
        longitude: parseFloat(clientData.longitude) || null,
        city: clientData.city || 'Unknown',
        region: clientData.region || 'Unknown',
        country: clientData.country || 'Unknown',
        fullAddress: clientData.fullAddress || null
      };

      const updatedVisit = await db.updateVisit(clientData.id, updatedFields);
      if (updatedVisit) {
        return res.json({ success: true, visit: updatedVisit, updated: true });
      }
    }

    const userAgent = req.headers['user-agent'] || '';
    const parsedUA = parseUA(userAgent);

    // Determine the IP address
    // 1. Check if client sent an IP (e.g., from client-side ipapi.co lookup)
    // 2. Fall back to Express req.ip (or x-forwarded-for)
    let ip = clientData.ip || req.ip || req.socket.remoteAddress || 'Unknown';
    if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') {
      // If server sees local IP but client has detected a public IP, use client IP
      if (clientData.ip && clientData.ip !== '127.0.0.1' && clientData.ip !== '::1') {
        ip = clientData.ip;
      }
    }

    const visit = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      ip: ip,
      country: clientData.country || clientData.country_name || 'Unknown',
      countryCode: clientData.countryCode || clientData.country_code || 'Unknown',
      region: clientData.region || clientData.region_name || 'Unknown',
      city: clientData.city || 'Unknown',
      latitude: parseFloat(clientData.latitude) || null,
      longitude: parseFloat(clientData.longitude) || null,
      isp: clientData.isp || clientData.org || 'Unknown',
      browser: parsedUA.browser,
      os: parsedUA.os,
      device: parsedUA.device,
      screenResolution: clientData.screenResolution || 'Unknown',
      timezone: clientData.timezone || 'Unknown',
      language: clientData.language || 'Unknown',
      referrer: clientData.referrer || 'Direct',
      fullAddress: clientData.fullAddress || null
    };

    await db.addVisit(visit);
    
    // Return the processed visit log to the client for verification
    res.status(201).json({ success: true, visit });
  } catch (error) {
    console.error('Error logging visit:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// 3. Fetch all visits (Admin only)
app.get('/api/visits', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const visits = await db.read();
    // Return visits sorted by newest first
    const sortedVisits = [...visits].reverse();
    res.json({ success: true, visits: sortedVisits });
  } catch (error) {
    console.error('Error reading visits:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// 4. Clear all visits (Admin only)
app.post('/api/clear-visits', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    await db.clear();
    res.json({ success: true, message: 'All logs cleared successfully' });
  } catch (error) {
    console.error('Error clearing visits:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// Serve frontend paths explicitly for cleaner routing if needed
app.get(ADMIN_ROUTE, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 Location Detector Server running on port ${PORT}`);
  console.log(`🌐 Public Visitor Page: http://localhost:${PORT}`);
  console.log(`🔒 Admin Analytics Portal: http://localhost:${PORT}${ADMIN_ROUTE}`);
  console.log(`===================================================`);
});
