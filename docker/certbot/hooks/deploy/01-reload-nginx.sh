#!/bin/bash
# Reload Nginx after certificate renewal

echo "Reloading Nginx configuration..."

# Check if running in Docker
if [ -f /.dockerenv ]; then
    # Send reload signal to Nginx container
    docker exec warehouse-nginx nginx -s reload
else
    # Reload Nginx directly
    nginx -s reload
fi

echo "Nginx reloaded successfully"