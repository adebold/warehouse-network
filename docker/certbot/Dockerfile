# Certbot Docker image for Let's Encrypt certificate management
FROM certbot/certbot:latest

# Install additional tools
RUN apk add --no-cache \
    bash \
    curl \
    jq \
    openssl

# Copy renewal hooks
COPY hooks /etc/letsencrypt/renewal-hooks

# Make hooks executable
RUN chmod +x /etc/letsencrypt/renewal-hooks/deploy/* \
    /etc/letsencrypt/renewal-hooks/pre/* \
    /etc/letsencrypt/renewal-hooks/post/*

# Set working directory
WORKDIR /opt/certbot

# Default command (can be overridden)
CMD ["certonly"]