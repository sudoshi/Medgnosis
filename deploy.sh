#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Environment variables - these should be passed as arguments or set in a config file
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://demo.medgnosis.app/api}"
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://demo.medgnosis.app}"
export NODE_ENV="production"
export DEPLOY_PATH="/var/www/Medgnosis"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to log messages with timestamp
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to handle errors
handle_error() {
    log "${RED}Error: $1${NC}"
    exit 1
}

log "${GREEN}Starting Apache2 deployment...${NC}"

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    handle_error "Please run as root or with sudo"
fi

# Frontend deployment
log "${GREEN}Setting up frontend...${NC}"
cd frontend || handle_error "Failed to change directory to frontend"

# Verify required files exist with more descriptive paths
required_files=(
    "components/layout/AdminLayout.tsx"
    "services/mockAnticipatoryData.ts"
    "tsconfig.json"
    "next.config.js"
)

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        handle_error "Required file $file not found in $(pwd)/$file"
    fi
done

# Clean build artifacts but preserve configuration and lock file
log "Cleaning build artifacts..."
rm -rf .next
rm -rf node_modules

# Verify PostCSS config
if [ ! -f "postcss.config.js" ]; then
    log "Creating PostCSS config..."
    cat > postcss.config.js << 'POSTCSS'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
POSTCSS
fi

# Install dependencies using package-lock.json for consistency
log "Installing dependencies..."
if [ -f "package-lock.json" ]; then
    npm ci || handle_error "npm ci failed"
else
    log "${YELLOW}Warning: package-lock.json not found, using npm install${NC}"
    npm install || handle_error "npm install failed"
fi

# Install platform-specific dependencies for GNU systems
log "Installing platform-specific dependencies..."
npm install -D @next/swc-linux-x64-gnu || handle_error "Failed to install platform-specific dependencies"

# Verify tsconfig paths
log "Verifying TypeScript configuration..."
if ! grep -q '"@/\*"' tsconfig.json; then
    handle_error "TypeScript path aliases not configured correctly"
fi

# Update next.config.js to ensure proper module resolution
log "Updating Next.js configuration..."
cat > next.config.js << 'NEXTCONFIG'
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  compress: true,
  poweredByHeader: false,
  
  // Configure module resolution
  webpack: (config, { isServer }) => {
    config.resolve.modules.push(__dirname)
    return config
  },

  // Configure rewrites for API proxying
  async rewrites() {
    return process.env.NODE_ENV === 'production' ? [] : [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
      {
        source: '/sanctum/csrf-cookie',
        destination: 'http://localhost:8000/sanctum/csrf-cookie',
      }
    ]
  },

  // Configure response headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig
NEXTCONFIG

# Build the frontend with detailed logging
log "Building frontend..."
NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 npm run build || handle_error "Frontend build failed"

# Create production build directory if it doesn't exist
log "Creating production build directory..."
mkdir -p dist/.next || handle_error "Failed to create dist directory"

# Copy the standalone build to dist
log "Copying standalone build..."
cp -r .next/standalone/* dist/ || handle_error "Failed to copy standalone build"
cp -r .next/static dist/.next/ || handle_error "Failed to copy static assets"
cp -r public dist/ || handle_error "Failed to copy public assets"

# Set permissions
log "Setting permissions..."
chown -R www-data:www-data dist || handle_error "Failed to set ownership"
chmod -R 755 dist || handle_error "Failed to set permissions"

# Deploy to Apache with backup
log "Deploying to Apache..."
if [ -d "$DEPLOY_PATH" ]; then
    backup_dir="${DEPLOY_PATH}_backup_$(date +%Y%m%d_%H%M%S)"
    log "Creating backup of current deployment to $backup_dir"
    mv "$DEPLOY_PATH" "$backup_dir" || handle_error "Failed to create backup"
fi

mkdir -p "$DEPLOY_PATH" || handle_error "Failed to create deploy directory"
cp -r dist/* "$DEPLOY_PATH"/ || handle_error "Failed to copy files to deploy path"

log "${GREEN}Frontend deployment complete!${NC}"

# Set up Laravel backend
log "Setting up Laravel backend..."
cd ../backend || handle_error "Failed to change directory to backend"

# Check for .env file and provide guidance
if [ ! -f ".env" ]; then
    handle_error "'.env' file not found in backend directory. Please copy .env.example to .env and configure it appropriately."
fi

# Install dependencies
log "Installing backend dependencies..."
composer install --no-dev --optimize-autoloader || handle_error "Composer install failed"

# Run database migrations if needed
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
    log "Running database migrations..."
    php artisan migrate --force || handle_error "Database migration failed"
fi

# Clear all caches
log "Clearing caches..."
php artisan cache:clear
php artisan config:clear
php artisan route:clear
php artisan view:clear

# Optimize for production
log "Optimizing for production..."
php artisan config:cache || handle_error "Config cache failed"
php artisan route:cache || handle_error "Route cache failed"
php artisan view:cache || handle_error "View cache failed"

# Return to the root directory
cd ..

# Restart and verify Apache
log "Restarting Apache..."
if ! systemctl restart apache2; then
    log "${RED}Failed to restart Apache. Rolling back deployment...${NC}"
    rm -rf "$DEPLOY_PATH"
    if [ -d "$backup_dir" ]; then
        mv "$backup_dir" "$DEPLOY_PATH"
    fi
    handle_error "Apache restart failed"
fi

# Verify Apache is running
if ! systemctl is-active --quiet apache2; then
    log "${RED}Apache is not running after restart. Rolling back deployment...${NC}"
    rm -rf "$DEPLOY_PATH"
    if [ -d "$backup_dir" ]; then
        mv "$backup_dir" "$DEPLOY_PATH"
    fi
    handle_error "Apache is not running"
fi

log "${GREEN}Apache successfully restarted and running${NC}"
log "${GREEN}Deployment complete!${NC}"
