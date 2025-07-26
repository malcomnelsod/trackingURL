#!/bin/bash

# Simple LinkTracker Deployment Script
set -e

echo "🚀 Starting simple LinkTracker deployment..."

# Configuration
APP_NAME="linktracker"
APP_DIR="/var/www/$APP_NAME"
NODE_VERSION="20"

# Get domain name
read -p "Enter your domain name (or press Enter for localhost): " DOMAIN_NAME
DOMAIN_NAME=${DOMAIN_NAME:-localhost}

echo "📦 Step 1: Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
fi

echo "📦 Step 2: Installing Nginx..."
if ! command -v apache2 &> /dev/null; then
    apt install -y apache2
    a2enmod rewrite
    a2enmod proxy
    a2enmod proxy_http
    a2enmod headers
fi

echo "📦 Step 3: Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

echo "📁 Step 4: Setting up application directory..."
mkdir -p $APP_DIR
cp -r ./* $APP_DIR/
cd $APP_DIR

echo "📦 Step 5: Installing dependencies..."
npm install

echo "🔨 Step 6: Building application..."
npm run build

echo "📁 Step 7: Creating data directory..."
mkdir -p $APP_DIR/server/data
chown -R www-data:www-data $APP_DIR

echo "⚙️ Step 8: Creating simple systemd service..."
cat > /etc/systemd/system/$APP_NAME.service << EOF
[Unit]
Description=LinkTracker Application
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
EOF

echo "🌐 Step 9: Creating simple Apache configuration..."
cat > /etc/apache2/sites-available/$APP_NAME.conf << EOF
<VirtualHost *:80>
    ServerName $DOMAIN_NAME
    DocumentRoot $APP_DIR/dist
    
    # Enable rewrite engine
    RewriteEngine On
    
    # Proxy API requests to Node.js
    ProxyPreserveHost On
    ProxyRequests Off
    
    # API routes
    ProxyPass /api/ http://localhost:3001/api/
    ProxyPassReverse /api/ http://localhost:3001/api/
    
    # Short link redirects (6-8 character codes)
    RewriteRule "^/([a-zA-Z0-9]{6,8})$" "http://localhost:3001/\$1" [P,L]
    
    # Serve static files
    <Directory "$APP_DIR/dist">
        Options -Indexes
        AllowOverride None
        Require all granted
        
        # Handle React Router
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>
    
    # Security headers
    Header always set X-Content-Type-Options nosniff
    Header always set X-Frame-Options DENY
    Header always set X-XSS-Protection "1; mode=block"
    
    # Logging
    ErrorLog \${APACHE_LOG_DIR}/$APP_NAME-error.log
    CustomLog \${APACHE_LOG_DIR}/$APP_NAME-access.log combined
</VirtualHost>
EOF

echo "🔗 Step 10: Enabling site..."
# Disable default Apache site
a2dissite 000-default
# Enable our site
a2ensite $APP_NAME

echo "🧪 Step 11: Testing Apache configuration..."
apache2ctl configtest

echo "🚀 Step 12: Starting services..."
systemctl daemon-reload
systemctl enable $APP_NAME
systemctl start $APP_NAME
systemctl restart apache2

echo "✅ Step 13: Checking service status..."
sleep 3

if systemctl is-active --quiet $APP_NAME; then
    echo "✅ LinkTracker service is running"
else
    echo "❌ LinkTracker service failed to start"
    journalctl -u $APP_NAME --no-pager -l
    exit 1
fi

if systemctl is-active --quiet apache2; then
    echo "✅ Apache is running"
else
    echo "❌ Apache failed to start"
    exit 1
fi

echo ""
echo "🎉 Simple deployment completed successfully!"
echo ""
echo "📋 Access your application:"
echo "   • URL: http://$DOMAIN_NAME"
echo "   • Default login: admin@linktracker.com / admin123"
echo ""
echo "🔧 Management commands:"
echo "   • View logs: journalctl -u $APP_NAME -f"
echo "   • Restart: systemctl restart $APP_NAME"
echo "   • Status: systemctl status $APP_NAME"
echo ""
echo "⚠️  Remember to:"
echo "   1. Change the default admin password"
echo "   2. Point your domain DNS to this server's IP"
echo "   3. Consider setting up SSL with certbot later"