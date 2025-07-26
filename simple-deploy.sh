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
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
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

echo "🌐 Step 9: Creating simple Nginx configuration..."
cat > /etc/nginx/sites-available/$APP_NAME << EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ~ ^/[a-zA-Z0-9]{6,8}\$ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        root $APP_DIR/dist;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

echo "🔗 Step 10: Enabling site..."
ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo "🧪 Step 11: Testing Nginx configuration..."
nginx -t

echo "🚀 Step 12: Starting services..."
systemctl daemon-reload
systemctl enable $APP_NAME
systemctl start $APP_NAME
systemctl restart nginx

echo "✅ Step 13: Checking service status..."
sleep 3

if systemctl is-active --quiet $APP_NAME; then
    echo "✅ LinkTracker service is running"
else
    echo "❌ LinkTracker service failed to start"
    journalctl -u $APP_NAME --no-pager -l
    exit 1
fi

if systemctl is-active --quiet nginx; then
    echo "✅ Nginx is running"
else
    echo "❌ Nginx failed to start"
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