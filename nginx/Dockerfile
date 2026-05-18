FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Remove default nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create SSL directory
RUN mkdir -p /etc/nginx/ssl

# Create certbot webroot directory for Let's Encrypt
RUN mkdir -p /var/www/certbot

# Create log directory
RUN mkdir -p /var/log/nginx

# Set permissions
RUN chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /var/www/certbot

# Validate nginx configuration
RUN nginx -t

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
