#!/bin/bash
# SubTrack — Oracle Cloud Deployment Script
# Run this on your Oracle Cloud ARM VM (Ubuntu 22.04/24.04)
# Usage: bash deploy.sh

set -e

echo "=== SubTrack Deployment ==="

# 1. System update
echo "[1/7] Updating system..."
sudo apt update && sudo apt upgrade -y

# 2. Install Python 3.11
echo "[2/7] Installing Python 3.11..."
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install python3.11 python3.11-venv python3.11-dev git nginx -y

# 3. Clone repo
echo "[3/7] Cloning repository..."
sudo mkdir -p /var/www
cd /var/www
if [ -d "subsidiary-tracker" ]; then
    cd subsidiary-tracker && git pull
else
    sudo git clone https://github.com/vardhanreddy369/subsidiary-tracker.git
    sudo chown -R $USER:$USER subsidiary-tracker
    cd subsidiary-tracker
fi

# 4. Set up Python environment
echo "[4/7] Setting up Python environment..."
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 5. Build database from CSV exports
echo "[5/7] Building database (1.17M subsidiaries)..."
python -m backend.rebuild_db

# 6. Create systemd service
echo "[6/7] Creating systemd service..."
sudo tee /etc/systemd/system/subtrack.service << EOF
[Unit]
Description=SubTrack FastAPI Application
After=network.target

[Service]
User=$USER
WorkingDirectory=/var/www/subsidiary-tracker
Environment="GEMINI_API_KEY=${GEMINI_API_KEY:-}"
ExecStart=/var/www/subsidiary-tracker/venv/bin/uvicorn backend.app:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl restart subtrack
sudo systemctl enable subtrack

# 7. Configure nginx
echo "[7/7] Configuring nginx..."
PUBLIC_IP=$(curl -s ifconfig.me)
sudo tee /etc/nginx/sites-available/subtrack << EOF
server {
    listen 80;
    server_name $PUBLIC_IP;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # SSE support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }

    location /static/ {
        alias /var/www/subsidiary-tracker/frontend/;
        expires 7d;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/subtrack /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# Open ports in VM firewall (Oracle Cloud iptables)
sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
sudo apt install netfilter-persistent -y
sudo netfilter-persistent save

echo ""
echo "=== DEPLOYMENT COMPLETE ==="
echo "SubTrack is live at: http://$PUBLIC_IP"
echo ""
echo "Next steps:"
echo "  1. Add security list rules in Oracle Cloud Console (ports 80, 443)"
echo "  2. (Optional) Point a domain and run: sudo certbot --nginx -d yourdomain.com"
echo "  3. Set Gemini API key: sudo systemctl edit subtrack (add Environment=GEMINI_API_KEY=...)"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status subtrack    # Check app status"
echo "  sudo journalctl -u subtrack -f    # View app logs"
echo "  cd /var/www/subsidiary-tracker && git pull && sudo systemctl restart subtrack  # Update"
