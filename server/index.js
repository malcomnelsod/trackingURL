import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs/promises';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import UAParser from 'ua-parser-js';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import csvParser from 'csv-parser';
import csvWriter from 'csv-writer';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Add console log to confirm server is starting
console.log('Starting LinkTracker server...');
console.log('Port:', PORT);
console.log('Environment:', process.env.NODE_ENV || 'development');

// Rate limiting
const rateLimiter = new RateLimiterMemory({
  keyPrefix: 'middleware',
  points: 100, // Number of requests
  duration: 60, // Per 60 seconds
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173'],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

// Rate limiting middleware
const rateLimitMiddleware = async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    res.status(429).json({ error: 'Too many requests' });
  }
};

app.use(rateLimitMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// CSV file paths
const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
  users: path.join(DATA_DIR, 'users.csv'),
  links: path.join(DATA_DIR, 'links.csv'),
  clicks: path.join(DATA_DIR, 'clicks.csv'),
  campaigns: path.join(DATA_DIR, 'campaigns.csv'),
  domains: path.join(DATA_DIR, 'domains.csv')
};

// Initialize data directory and CSV files
async function initializeDataFiles() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    // Initialize users.csv
    const usersExists = await fs.access(FILES.users).then(() => true).catch(() => false);
    if (!usersExists) {
      const usersWriter = csvWriter.createObjectCsvWriter({
        path: FILES.users,
        header: [
          { id: 'id', title: 'id' },
          { id: 'email', title: 'email' },
          { id: 'password', title: 'password' },
          { id: 'name', title: 'name' },
          { id: 'plan', title: 'plan' },
          { id: 'created_at', title: 'created_at' }
        ]
      });
      
      // Create default admin user
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await usersWriter.writeRecords([{
        id: 'admin-1',
        email: 'admin@linktracker.com',
        password: hashedPassword,
        name: 'Admin User',
        plan: 'pro',
        created_at: new Date().toISOString()
      }]);
    }

    // Initialize other CSV files
    const csvFiles = [
      { file: FILES.links, headers: ['id', 'user_id', 'original_url', 'short_code', 'title', 'description', 'campaign_id', 'domain_id', 'is_cloaked', 'cloak_title', 'cloak_description', 'password_hash', 'expires_at', 'is_active', 'click_count', 'created_at', 'updated_at'] },
      { file: FILES.clicks, headers: ['id', 'link_id', 'campaign_id', 'ip_address', 'user_agent', 'referer', 'country', 'city', 'device_type', 'browser', 'os', 'created_at'] },
      { file: FILES.campaigns, headers: ['id', 'user_id', 'name', 'description', 'is_active', 'total_clicks', 'unique_clicks', 'conversion_rate', 'created_at', 'updated_at'] },
      { file: FILES.domains, headers: ['id', 'user_id', 'domain', 'is_verified', 'ssl_enabled', 'is_active', 'created_at', 'updated_at'] }
    ];

    for (const { file, headers } of csvFiles) {
      const exists = await fs.access(file).then(() => true).catch(() => false);
      if (!exists) {
        const writer = csvWriter.createObjectCsvWriter({
          path: file,
          header: headers.map(h => ({ id: h, title: h }))
        });
        await writer.writeRecords([]);
      }
    }
  } catch (error) {
    console.error('Error initializing data files:', error);
  }
}

// CSV utility functions
async function readCSV(filePath) {
  const results = [];
  return new Promise((resolve, reject) => {
    createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function writeCSV(filePath, data, headers) {
  const writer = csvWriter.createObjectCsvWriter({
    path: filePath,
    header: headers.map(h => ({ id: h, title: h }))
  });
  await writer.writeRecords(data);
}

async function appendToCSV(filePath, record, headers) {
  const existingData = await readCSV(filePath);
  existingData.push(record);
  await writeCSV(filePath, existingData, headers);
}

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const users = await readCSV(FILES.users);
    const user = users.find(u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Generate short code
function generateShortCode(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const users = await readCSV(FILES.users);
    const user = users.find(u => u.email === email);

    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        plan: user.plan 
      } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const users = await readCSV(FILES.users);
    
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: `user-${Date.now()}`,
      email,
      password: hashedPassword,
      name,
      plan: 'free',
      created_at: new Date().toISOString()
    };

    await appendToCSV(FILES.users, newUser, ['id', 'email', 'password', 'name', 'plan', 'created_at']);
    
    const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ 
      token, 
      user: { 
        id: newUser.id, 
        email: newUser.email, 
        name: newUser.name, 
        plan: newUser.plan 
      } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Links routes
app.get('/api/links', authenticateToken, async (req, res) => {
  try {
    const links = await readCSV(FILES.links);
    const userLinks = links.filter(link => link.user_id === req.user.id);
    res.json(userLinks);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/links', authenticateToken, async (req, res) => {
  try {
    const { 
      original_url, 
      title, 
      description, 
      campaign_id, 
      domain_id, 
      is_cloaked, 
      cloak_title, 
      cloak_description,
      password,
      expires_at 
    } = req.body;

    const links = await readCSV(FILES.links);
    let short_code;
    
    // Generate unique short code
    do {
      short_code = generateShortCode();
    } while (links.find(link => link.short_code === short_code));

    const newLink = {
      id: `link-${Date.now()}`,
      user_id: req.user.id,
      original_url,
      short_code,
      title: title || '',
      description: description || '',
      campaign_id: campaign_id || '',
      domain_id: domain_id || '',
      is_cloaked: is_cloaked || false,
      cloak_title: cloak_title || '',
      cloak_description: cloak_description || '',
      password_hash: password ? await bcrypt.hash(password, 10) : '',
      expires_at: expires_at || '',
      is_active: true,
      click_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await appendToCSV(FILES.links, newLink, ['id', 'user_id', 'original_url', 'short_code', 'title', 'description', 'campaign_id', 'domain_id', 'is_cloaked', 'cloak_title', 'cloak_description', 'password_hash', 'expires_at', 'is_active', 'click_count', 'created_at', 'updated_at']);
    
    res.json(newLink);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Campaigns routes
app.get('/api/campaigns', authenticateToken, async (req, res) => {
  try {
    const campaigns = await readCSV(FILES.campaigns);
    const userCampaigns = campaigns.filter(campaign => campaign.user_id === req.user.id);
    res.json(userCampaigns);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/campaigns', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;

    const newCampaign = {
      id: `campaign-${Date.now()}`,
      user_id: req.user.id,
      name,
      description: description || '',
      is_active: true,
      total_clicks: 0,
      unique_clicks: 0,
      conversion_rate: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await appendToCSV(FILES.campaigns, newCampaign, ['id', 'user_id', 'name', 'description', 'is_active', 'total_clicks', 'unique_clicks', 'conversion_rate', 'created_at', 'updated_at']);
    
    res.json(newCampaign);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Domains routes
app.get('/api/domains', authenticateToken, async (req, res) => {
  try {
    const domains = await readCSV(FILES.domains);
    const userDomains = domains.filter(domain => domain.user_id === req.user.id);
    res.json(userDomains);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/domains', authenticateToken, async (req, res) => {
  try {
    const { domain } = req.body;

    const newDomain = {
      id: `domain-${Date.now()}`,
      user_id: req.user.id,
      domain,
      is_verified: false,
      ssl_enabled: false,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await appendToCSV(FILES.domains, newDomain, ['id', 'user_id', 'domain', 'is_verified', 'ssl_enabled', 'is_active', 'created_at', 'updated_at']);
    
    res.json(newDomain);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Analytics route
app.get('/api/analytics', authenticateToken, async (req, res) => {
  try {
    const links = await readCSV(FILES.links);
    const clicks = await readCSV(FILES.clicks);
    const campaigns = await readCSV(FILES.campaigns);

    const userLinks = links.filter(link => link.user_id === req.user.id);
    const userLinkIds = userLinks.map(link => link.id);
    const userClicks = clicks.filter(click => userLinkIds.includes(click.link_id));

    // Calculate analytics
    const totalClicks = userClicks.length;
    const uniqueClicks = new Set(userClicks.map(click => click.ip_address)).size;

    const topLinks = userLinks
      .sort((a, b) => parseInt(b.click_count) - parseInt(a.click_count))
      .slice(0, 5)
      .map(link => ({
        short_code: link.short_code,
        title: link.title || link.original_url,
        clicks: parseInt(link.click_count)
      }));

    const deviceTypes = userClicks.reduce((acc, click) => {
      acc[click.device_type] = (acc[click.device_type] || 0) + 1;
      return acc;
    }, {});

    const clicksByDay = userClicks.reduce((acc, click) => {
      const date = new Date(click.created_at).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    res.json({
      totalClicks,
      uniqueClicks,
      topLinks,
      deviceTypes: Object.entries(deviceTypes).map(([device, clicks]) => ({ device, clicks })),
      clicksByDay: Object.entries(clicksByDay).map(([date, clicks]) => ({ date, clicks }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Redirect route (public)
app.get('/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;
    const links = await readCSV(FILES.links);
    const link = links.find(l => l.short_code === shortCode && l.is_active === 'true');

    if (!link) {
      return res.status(404).send('Link not found');
    }

    // Check expiration
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).send('Link has expired');
    }

    // Parse user agent
    const parser = new UAParser(req.headers['user-agent']);
    const device = parser.getDevice();
    const browser = parser.getBrowser();
    const os = parser.getOS();

    // Track click
    const clickRecord = {
      id: `click-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      link_id: link.id,
      campaign_id: link.campaign_id || '',
      ip_address: req.ip || req.connection.remoteAddress || 'unknown',
      user_agent: req.headers['user-agent'] || '',
      referer: req.headers.referer || '',
      country: '', // Would integrate with IP geolocation service
      city: '',
      device_type: device.type || 'desktop',
      browser: browser.name || 'unknown',
      os: os.name || 'unknown',
      created_at: new Date().toISOString()
    };

    await appendToCSV(FILES.clicks, clickRecord, ['id', 'link_id', 'campaign_id', 'ip_address', 'user_agent', 'referer', 'country', 'city', 'device_type', 'browser', 'os', 'created_at']);

    // Update click count
    const allLinks = await readCSV(FILES.links);
    const linkIndex = allLinks.findIndex(l => l.id === link.id);
    if (linkIndex !== -1) {
      allLinks[linkIndex].click_count = (parseInt(allLinks[linkIndex].click_count) + 1).toString();
      allLinks[linkIndex].updated_at = new Date().toISOString();
      await writeCSV(FILES.links, allLinks, ['id', 'user_id', 'original_url', 'short_code', 'title', 'description', 'campaign_id', 'domain_id', 'is_cloaked', 'cloak_title', 'cloak_description', 'password_hash', 'expires_at', 'is_active', 'click_count', 'created_at', 'updated_at']);
    }

    // Handle cloaking
    if (link.is_cloaked === 'true') {
      const cloakedHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${link.cloak_title || 'Redirecting...'}</title>
    <meta name="description" content="${link.cloak_description || 'Please wait while we redirect you...'}">
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            text-align: center;
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
        }
        .spinner {
            border: 4px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top: 4px solid white;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
    <script>
        setTimeout(() => {
            window.location.href = '${link.original_url}';
        }, 2000);
    </script>
</head>
<body>
    <div class="container">
        <div class="spinner"></div>
        <h2>${link.cloak_title || 'Redirecting...'}</h2>
        <p>${link.cloak_description || 'Please wait while we redirect you to your destination.'}</p>
    </div>
</body>
</html>`;
      
      return res.send(cloakedHtml);
    }

    // Direct redirect
    res.redirect(link.original_url);
  } catch (error) {
    console.error('Redirect error:', error);
    res.status(500).send('Server error');
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Initialize and start server
initializeDataFiles().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});