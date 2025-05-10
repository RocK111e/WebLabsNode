daemon running the server: webnode.service

check the daemon: sudo systemctl status webnode.service

daemon content: /etc/systemd/system/webnode.service

###
[Unit]
Description=WebNode Node.js Application
After=network.target

[Service]
Type=simple
User=rock1e
WorkingDirectory=/home/rock1e/nulp/WebBackNode
ExecStart=/bin/bash -c 'source /home/rock1e/.nvm/nvm.sh && nvm use 20.19.1 && pnpm run dev'
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
###