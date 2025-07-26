#!/bin/bash

# LinkTracker Deployment Script for Ubuntu 24.04
# This script automates the deployment of the LinkTracker application

set -e  # Exit on any error

echo "🚀 Starting LinkTracker deployment on Ubuntu 24.04..."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="linktracker"
APP_DIR="/var/www/$APP_NAME"
SERVICE_FILE="/etc/systemd/system/$APP_NAME.service"
NGINX_CONFIG="/etc/nginx/sites-available/$APP_NAME"
NODE_VERSION="20"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root. Please run as a regular user with sudo privileges."
   exit 1
fi

# Get domain name from user
read -p "Enter your domain name (e.g., linktracker.yourdomain.com): " DOMAIN_NAME
if [[ -z "$DOMAIN_NAME" ]]; then
    print_error "Domain name is required!"
    exit 1
fi

# Get SSL choice
read -p "Do you want to enable SSL with Let's Encrypt? (y/n): " ENABLE_SSL
ENABLE_SSL=${ENABLE_SSL,,} # Convert to lowercase

print_step "1. Updating system packages..."
sudo apt update && sudo apt upgrade -y

print_step "2. Installing Node.js $NODE_VERSION..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    print_status "Node.js is already installed"
fi

print_step "3. Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    sudo apt install -y nginx
else
    print_status "Nginx is already installed"
fi

print_step "4. Installing PM2 for process management..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
else
    print_status "PM2 is already installed"
fi

print_step "5. Creating application directory..."
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR

print_step "6. Copying application files..."
cp -r ./* $APP_DIR/
cd $APP_DIR

print_step "7. Installing dependencies..."
npm install --production

print_step "8. Building the application..."
npm run build

print_step "9. Creating data directory..."
mkdir -p $APP_DIR/server/data

print_step "10. Creating systemd service..."
sudo tee $SERVICE_FILE > /dev/null <<EOF
[Unit]
Description=LinkTracker URL Redirector
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=JWT_SECRET=$(openssl rand -hex 32)

[Install]
WantedBy=multi-user.target
EOF

print_step "11. Configuring Nginx..."
sudo tee $NGINX_CONFIG > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
    
    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \$binary_remote_addr zone=redirect:10m rate=100r/s;
    
    # API routes
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Short link redirects
    location ~ ^/[a-zA-Z0-9]{6,8}$ {
        limit_req zone=redirect burst=50 nodelay;
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Static files
    location / {
        root $APP_DIR/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Health check
    location /health {
        access_log off;
        return 200 "healthy";
        add_header Content-Type text/plain;
    }
}
EOF

# Enable the site
sudo ln -sf $NGINX_CONFIG /etc/nginx/sites-enabled/
sudo nginx -t

print_step "12. Starting services..."
sudo systemctl daemon-reload
sudo systemctl enable $APP_NAME
sudo systemctl start $APP_NAME
sudo systemctl enable nginx
sudo systemctl restart nginx

# Setup SSL if requested
if [[ "$ENABLE_SSL" == "y" ]]; then
    print_step "13. Setting up SSL with Let's Encrypt..."
    
    if ! command -v certbot &> /dev/null; then
        sudo apt install -y certbot python3-certbot-nginx
    fi
    
    # Get SSL certificate
    sudo certbot --nginx -d $DOMAIN_NAME --non-interactive --agree-tos --email admin@$DOMAIN_NAME
    
    print_status "SSL certificate installed successfully!"
fi

print_step "14. Setting up log rotation..."
sudo tee /etc/logrotate.d/$APP_NAME > /dev/null <<EOF
/var/log/$APP_NAME/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 0640 $USER $USER
    postrotate
        systemctl reload $APP_NAME
    endscript
}
EOF

print_step "15. Creating backup script..."
sudo tee /usr/local/bin/backup-$APP_NAME > /dev/null <<EOF
#!/bin/bash
BACKUP_DIR="/var/backups/$APP_NAME"
DATE=\$(date +%Y%m%d_%H%M%S)

mkdir -p \$BACKUP_DIR

# Backup CSV data
tar -czf \$BACKUP_DIR/data_\$DATE.tar.gz -C $APP_DIR/server data/

# Keep only last 30 days of backups
find \$BACKUP_DIR -name "data_*.tar.gz" -mtime +30 -delete

echo "Backup completed: \$BACKUP_DIR/data_\$DATE.tar.gz"
EOF

sudo chmod +x /usr/local/bin/backup-$APP_NAME

# Setup daily backup cron job
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-$APP_NAME") | crontab -

print_step "16. Setting up monitoring..."
sudo tee /usr/local/bin/monitor-$APP_NAME > /dev/null <<EOF
#!/bin/bash
if ! systemctl is-active --quiet $APP_NAME; then
    echo "LinkTracker service is down, restarting..."
    systemctl restart $APP_NAME
    echo "LinkTracker service restarted at \$(date)" >> /var/log/$APP_NAME-monitor.log
fi
EOF

sudo chmod +x /usr/local/bin/monitor-$APP_NAME

# Add monitoring to cron
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/monitor-$APP_NAME") | crontab -

print_step "17. Creating admin user management script..."
tee $APP_DIR/manage-users.js > /dev/null <<EOF
import fs from 'fs';
import bcrypt from 'bcryptjs';
import csvWriter from 'csv-writer';
import csvParser from 'csv-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, 'server/data/users.csv');

async function addUser(email, password, name, plan = 'free') {
    const users = [];
    
    // Read existing users
    if (fs.existsSync(USERS_FILE)) {
        await new Promise((resolve) => {
            fs.createReadStream(USERS_FILE)
                .pipe(csvParser())
                .on('data', (data) => users.push(data))
                .on('end', resolve);
        });
    }
    
    // Check if user exists
    if (users.find(u => u.email === email)) {
        console.log('User already exists!');
        return;
    }
    
    // Add new user
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: \`user-\${Date.now()}\`,
        email,
        password: hashedPassword,
        name,
        plan,
        created_at: new Date().toISOString()
    };
    
    users.push(newUser);
    
    // Write back to CSV
    const writer = csvWriter.createObjectCsvWriter({
        path: USERS_FILE,
        header: [
            { id: 'id', title: 'id' },
            { id: 'email', title: 'email' },
            { id: 'password', title: 'password' },
            { id: 'name', title: 'name' },
            { id: 'plan', title: 'plan' },
            { id: 'created_at', title: 'created_at' }
        ]
    });
    
    await writer.writeRecords(users);
    console.log(\`User \${email} added successfully!\`);
}

// CLI interface
const args = process.argv.slice(2);
if (args.length < 4) {
    console.log('Usage: node manage-users.js <email> <password> <name> [plan]');
    process.exit(1);
}

addUser(args[0], args[1], args[2], args[3] || 'free').catch(console.error);
EOF

print_step "18. Final checks..."
sleep 5

# Check if service is running
if systemctl is-active --quiet $APP_NAME; then
    print_status "✅ LinkTracker service is running"
else
    print_error "❌ LinkTracker service failed to start"
    sudo journalctl -u $APP_NAME --no-pager -l
fi

# Check if Nginx is running
if systemctl is-active --quiet nginx; then
    print_status "✅ Nginx is running"
else
    print_error "❌ Nginx failed to start"
fi

echo ""
print_status "🎉 LinkTracker deployment completed successfully!"
echo ""
echo "📋 Deployment Summary:"
echo "   • Application URL: http://$DOMAIN_NAME"
if [[ "$ENABLE_SSL" == "y" ]]; then
    echo "   • Secure URL: https://$DOMAIN_NAME"
fi
echo "   • Application directory: $APP_DIR"
echo "   • Service name: $APP_NAME"
echo "   • Default admin user: admin@linktracker.com"
echo "   • Default admin password: admin123"
echo ""
echo "🔧 Management Commands:"
echo "   • View logs: sudo journalctl -u $APP_NAME -f"
echo "   • Restart service: sudo systemctl restart $APP_NAME"
echo "   • Check status: sudo systemctl status $APP_NAME"
echo "   • Add user: cd $APP_DIR && node manage-users.js <email> <password> <name> [plan]"
echo "   • Backup data: /usr/local/bin/backup-$APP_NAME"
echo ""
echo "📁 Important Directories:"
echo "   • CSV data: $APP_DIR/server/data/"
echo "   • Backups: /var/backups/$APP_NAME/"
echo "   • Logs: /var/log/$APP_NAME/"
echo ""
print_warning "Please change the default admin password after first login!"
print_warning "Remember to configure your DNS to point $DOMAIN_NAME to this server's IP address."

# Display firewall recommendation
echo ""
print_step "19. Firewall configuration (optional)..."
echo "To secure your server, consider enabling UFW firewall:"
echo "   sudo ufw allow ssh"
echo "   sudo ufw allow 'Nginx Full'"
echo "   sudo ufw enable"

# Display backup restoration instructions
echo ""
echo "💾 To restore from backup:"
echo "   sudo systemctl stop $APP_NAME"
echo "   cd $APP_DIR/server"
echo "   tar -xzf /var/backups/$APP_NAME/data_YYYYMMDD_HHMMSS.tar.gz"
echo "   sudo systemctl start $APP_NAME"

print_status "Deployment script completed! Your LinkTracker application should now be accessible."