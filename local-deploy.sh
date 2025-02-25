#!/bin/bash

# Local deployment script for Medgnosis
# This script deploys the Medgnosis application to a local Apache server

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status messages
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

# Function to print error messages
print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Function to print warning messages
print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root"
fi

# Configuration
DOMAIN="demo.medgnosis.app"
DEPLOY_DIR="/var/www/Medgnosis"
REPO_DIR=$(pwd)
APACHE_CONF="/etc/apache2/sites-available/demo-medgnosis.conf"
NEXTJS_SERVICE="/etc/systemd/system/nextjs.service"
LARAVEL_SERVICE="/etc/systemd/system/laravel.service"

print_status "Starting Medgnosis local deployment..."

# Create deployment directory if it doesn't exist
if [ ! -d "$DEPLOY_DIR" ]; then
    print_status "Creating deployment directory: $DEPLOY_DIR"
    mkdir -p "$DEPLOY_DIR"
fi

# Copy frontend files (primary focus for updates)
print_status "Copying frontend files..."
rsync -av --exclude="node_modules" --exclude=".next" "$REPO_DIR/frontend/" "$DEPLOY_DIR/frontend/"

# Ensure Abby services directory exists
print_status "Setting up Abby services..."
mkdir -p "$DEPLOY_DIR/frontend/services/abby"

# Copy Abby service files
print_status "Copying Abby service files..."
rsync -av "$REPO_DIR/frontend/services/abby/" "$DEPLOY_DIR/frontend/services/abby/"

# Set up frontend environment
print_status "Setting up frontend environment..."
cat > "$DEPLOY_DIR/frontend/.env" << EOL
NEXT_PUBLIC_API_URL=https://demo.medgnosis.app/api
NEXT_PUBLIC_OLLAMA_URL=http://localhost:11434
NEXT_PUBLIC_ENABLE_ABBY=true
NEXT_PUBLIC_ABBY_VOICE_ENABLED=true
NEXT_PUBLIC_ABBY_WAKE_WORD=hey abby
NEXT_PUBLIC_ABBY_RATE_LIMIT=100
NEXT_PUBLIC_ABBY_CACHE_TTL=3600000
EOL

# Backend deployment with environment preservation
print_status "Handling backend deployment..."

# Copy backend files
print_status "Copying backend files..."
rsync -av --exclude="vendor" --exclude="node_modules" --exclude=".env" "$REPO_DIR/backend/" "$DEPLOY_DIR/backend/"

# Check if backend .env exists in deployment directory
if [ -f "$DEPLOY_DIR/backend/.env" ]; then
    print_status "Existing backend .env found, preserving it..."
    
    # Backup the existing .env file
    cp "$DEPLOY_DIR/backend/.env" "$DEPLOY_DIR/backend/.env.backup"
    
    # Check if APP_KEY is the placeholder or empty
    CURRENT_APP_KEY=$(grep "^APP_KEY=" "$DEPLOY_DIR/backend/.env" | cut -d= -f2)
    
    if [[ "$CURRENT_APP_KEY" == "base64:Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Y" || -z "$CURRENT_APP_KEY" ]]; then
        print_status "Invalid APP_KEY detected, generating a new one..."
        
        # Generate a new APP_KEY
        cd "$DEPLOY_DIR/backend"
        NEW_APP_KEY=$(php artisan key:generate --show)
        cd "$REPO_DIR"
        
        # Generate a new APP_KEY using openssl directly
        print_status "Generating a new APP_KEY..."
        SECURE_KEY="base64:$(openssl rand -base64 32)"
        
        # Update the APP_KEY in the .env file
        sed -i "s|^APP_KEY=.*|APP_KEY=$SECURE_KEY|g" "$DEPLOY_DIR/backend/.env"
        print_status "Set APP_KEY to: $SECURE_KEY"
        
        # Ensure the Laravel cache is cleared
        cd "$DEPLOY_DIR/backend"
        php artisan config:clear
        php artisan cache:clear
        cd "$REPO_DIR"
    fi
    
    # Ensure PostgreSQL connection details are correctly set
    print_status "Ensuring database connection details are correct..."
    sed -i "s|^DB_CONNECTION=.*|DB_CONNECTION=pgsql|" "$DEPLOY_DIR/backend/.env"
    sed -i "s|^DB_HOST=.*|DB_HOST=localhost|" "$DEPLOY_DIR/backend/.env"
    sed -i "s|^DB_PORT=.*|DB_PORT=5432|" "$DEPLOY_DIR/backend/.env"
    sed -i "s|^DB_DATABASE=.*|DB_DATABASE=PHM|" "$DEPLOY_DIR/backend/.env"
    sed -i "s|^DB_USERNAME=.*|DB_USERNAME=postgres|" "$DEPLOY_DIR/backend/.env"
    sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=acumenus|" "$DEPLOY_DIR/backend/.env"
    
    # Ensure DB_SCHEMA is set
    if ! grep -q "^DB_SCHEMA=" "$DEPLOY_DIR/backend/.env"; then
        echo "DB_SCHEMA=prod" >> "$DEPLOY_DIR/backend/.env"
    else
        sed -i "s|^DB_SCHEMA=.*|DB_SCHEMA=prod|" "$DEPLOY_DIR/backend/.env"
    fi
    
    # Update the repository's .env file with the valid APP_KEY for future deployments
    if [ -f "$REPO_DIR/backend/.env" ]; then
        VALID_APP_KEY=$(grep "^APP_KEY=" "$DEPLOY_DIR/backend/.env" | cut -d= -f2)
        sed -i "s|^APP_KEY=.*|APP_KEY=$VALID_APP_KEY|" "$REPO_DIR/backend/.env"
        print_status "Updated repository's .env with valid APP_KEY for future deployments"
    fi
else
    print_status "No existing backend .env found, creating a new one..."
    
    # Create a new .env file
    cat > "$DEPLOY_DIR/backend/.env" << EOL
APP_NAME=Medgnosis
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://demo.medgnosis.app

LOG_CHANNEL=stack
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=warning

DB_CONNECTION=pgsql
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=PHM
DB_USERNAME=postgres
DB_PASSWORD=acumenus
DB_SCHEMA=prod

BROADCAST_DRIVER=log
CACHE_DRIVER=file
FILESYSTEM_DISK=local
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=120

SANCTUM_STATEFUL_DOMAINS=demo.medgnosis.app
SESSION_DOMAIN=.demo.medgnosis.app
FRONTEND_URL=https://demo.medgnosis.app

CORS_ALLOWED_ORIGINS=https://demo.medgnosis.app
EOL

    # Generate a new APP_KEY
    cd "$DEPLOY_DIR/backend"
    NEW_APP_KEY=$(php artisan key:generate --show)
    cd "$REPO_DIR"
    
    # Update the APP_KEY in the .env file
    sed -i "s|^APP_KEY=.*|APP_KEY=$NEW_APP_KEY|" "$DEPLOY_DIR/backend/.env"
    
    # Update the repository's .env file with the valid APP_KEY for future deployments
    if [ -f "$REPO_DIR/backend/.env" ]; then
        sed -i "s|^APP_KEY=.*|APP_KEY=$NEW_APP_KEY|" "$REPO_DIR/backend/.env"
        print_status "Updated repository's .env with valid APP_KEY for future deployments"
    fi
fi

# Preserve API routes and controllers
print_status "Preserving API routes and controllers..."

# Only create API routes file if it doesn't exist
if [ ! -f "$DEPLOY_DIR/backend/routes/api.php" ]; then
    print_status "Creating default API routes..."
    mkdir -p "$DEPLOY_DIR/backend/routes"
    cat > "$DEPLOY_DIR/backend/routes/api.php" << EOL
<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/

// Public routes
Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/register', [AuthController::class, 'register']);

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', [AuthController::class, 'user']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    
    // Add other protected routes here
});

// Test route
Route::get('/test', function () {
    return response()->json(['message' => 'API is working!']);
});
EOL
fi

# Only create AuthController if it doesn't exist
if [ ! -f "$DEPLOY_DIR/backend/app/Http/Controllers/AuthController.php" ]; then
    print_status "Creating default AuthController..."
    mkdir -p "$DEPLOY_DIR/backend/app/Http/Controllers"
    cat > "$DEPLOY_DIR/backend/app/Http/Controllers/AuthController.php" << EOL
<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\User;

class AuthController extends Controller
{
    /**
     * Login user and create token
     *
     * @param  \Illuminate\Http\Request  \$request
     * @return \Illuminate\Http\JsonResponse
     */
    public function login(Request \$request)
    {
        \$credentials = \$request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        if (Auth::attempt(\$credentials)) {
            \$user = Auth::user();
            \$token = \$user->createToken('auth-token')->plainTextToken;

            return response()->json([
                'user' => \$user,
                'token' => \$token,
                'message' => 'Login successful'
            ]);
        }

        return response()->json([
            'message' => 'Invalid credentials'
        ], 401);
    }

    /**
     * Register a new user
     *
     * @param  \Illuminate\Http\Request  \$request
     * @return \Illuminate\Http\JsonResponse
     */
    public function register(Request \$request)
    {
        \$validatedData = \$request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8',
        ]);

        \$user = User::create([
            'name' => \$validatedData['name'],
            'email' => \$validatedData['email'],
            'password' => bcrypt(\$validatedData['password']),
        ]);

        \$token = \$user->createToken('auth-token')->plainTextToken;

        return response()->json([
            'user' => \$user,
            'token' => \$token,
            'message' => 'User registered successfully'
        ], 201);
    }

    /**
     * Logout user (Revoke the token)
     *
     * @param  \Illuminate\Http\Request  \$request
     * @return \Illuminate\Http\JsonResponse
     */
    public function logout(Request \$request)
    {
        \$request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Logged out successfully'
        ]);
    }

    /**
     * Get the authenticated User
     *
     * @param  \Illuminate\Http\Request  \$request
     * @return \Illuminate\Http\JsonResponse
     */
    public function user(Request \$request)
    {
        return response()->json(\$request->user());
    }
}
EOL
fi

# Set up Apache configuration
print_status "Setting up Apache configuration..."
cat > "$APACHE_CONF" << EOL
# Redirect all HTTP traffic to HTTPS
<VirtualHost *:80>
    ServerName demo.medgnosis.app
    Redirect permanent / https://demo.medgnosis.app/
</VirtualHost>

<VirtualHost *:443>
    ServerName demo.medgnosis.app
    ServerAdmin webmaster@demo.medgnosis.app
    
    # Enable required modules
    <IfModule !proxy_module>
        LoadModule proxy_module modules/mod_proxy.so
    </IfModule>
    <IfModule !proxy_http_module>
        LoadModule proxy_http_module modules/mod_proxy_http.so
    </IfModule>

    # Backend API - Proxy to Laravel on port 8001
    ProxyPreserveHost On
    ProxyPass /api http://localhost:8001/api
    ProxyPassReverse /api http://localhost:8001/api
    
    # Enable CORS
    <Location /api>
        # Get the origin from the request and set it as the allowed origin
        SetEnvIfNoCase Origin "^(https://demo\.medgnosis\.app\.?)" ORIGIN=\$1
        Header always set Access-Control-Allow-Origin "%{ORIGIN}e" env=ORIGIN
        Header always set Access-Control-Allow-Methods "POST, GET, OPTIONS, DELETE, PUT"
        Header always set Access-Control-Allow-Headers "Content-Type, Authorization, X-XSRF-TOKEN"
        Header always set Access-Control-Allow-Credentials "true"
        
        # Handle OPTIONS method for CORS preflight
        RewriteEngine On
        RewriteCond %{REQUEST_METHOD} OPTIONS
        RewriteRule ^(.*)$ \$1 [R=200,L]
    </Location>
    
    # Frontend Next.js Server
    ProxyPass /api !
    ProxyPass / http://localhost:3001/
    ProxyPassReverse / http://localhost:3001/

    # Security headers
    Header set X-Content-Type-Options "nosniff"
    Header set X-Frame-Options "SAMEORIGIN"
    Header set X-XSS-Protection "1; mode=block"

    ErrorLog \${APACHE_LOG_DIR}/error.log
    CustomLog \${APACHE_LOG_DIR}/access.log combined

    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/demo.medgnosis.app/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/demo.medgnosis.app/privkey.pem
</VirtualHost>
EOL

# Set up Next.js service
print_status "Setting up Next.js service..."

# Create log directory for Next.js
mkdir -p /var/log/nextjs
chown www-data:www-data /var/log/nextjs

cat > "$NEXTJS_SERVICE" << EOL
[Unit]
Description=Next.js Production Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$DEPLOY_DIR/frontend
ExecStart=/usr/bin/npm start
Restart=always
Environment=NODE_ENV=production
Environment=PORT=3001
StandardOutput=append:/var/log/nextjs/output.log
StandardError=append:/var/log/nextjs/error.log

[Install]
WantedBy=multi-user.target
EOL

# Set up Laravel service
print_status "Setting up Laravel service..."

# Create log directory for Laravel
mkdir -p /var/log/laravel
chown www-data:www-data /var/log/laravel

# Fix Laravel storage permissions
mkdir -p "$DEPLOY_DIR/backend/storage/logs"
mkdir -p "$DEPLOY_DIR/backend/storage/framework/cache"
mkdir -p "$DEPLOY_DIR/backend/storage/framework/sessions"
mkdir -p "$DEPLOY_DIR/backend/storage/framework/views"
chown -R www-data:www-data "$DEPLOY_DIR/backend/storage"
chmod -R 775 "$DEPLOY_DIR/backend/storage"

cat > "$LARAVEL_SERVICE" << EOL
[Unit]
Description=Laravel Production Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$DEPLOY_DIR/backend
ExecStart=/usr/bin/php artisan serve --port=8001 --host=0.0.0.0
Restart=always
Environment=APP_ENV=production
StandardOutput=append:/var/log/laravel/output.log
StandardError=append:/var/log/laravel/error.log

[Install]
WantedBy=multi-user.target
EOL

# Set permissions
print_status "Setting permissions..."
chown -R www-data:www-data "$DEPLOY_DIR"
chmod -R 755 "$DEPLOY_DIR"

# Set up Ollama service
print_status "Setting up Ollama service..."
cat > "/etc/systemd/system/ollama.service" << EOL
[Unit]
Description=Ollama AI Service
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/ollama serve
Restart=always

[Install]
WantedBy=multi-user.target
EOL

# Enable and start Ollama service
systemctl enable ollama.service
systemctl start ollama

# Pull required Ollama models
print_status "Pulling Ollama models..."
ollama pull mistral:7b-instruct

# Install dependencies for frontend
print_status "Installing frontend dependencies..."
cd "$DEPLOY_DIR/frontend"
npm install

# Build frontend
print_status "Building frontend..."
cd "$DEPLOY_DIR/frontend"
if ! npm run build; then
    print_error "Next.js build failed. Please check the error messages above."
fi

# Create production server.js for Next.js
print_status "Creating Next.js server configuration..."
cat > "$DEPLOY_DIR/frontend/server.js" << EOL
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3001;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  })
  .once('error', (err) => {
    console.error(err);
    process.exit(1);
  })
  .listen(port, () => {
    console.log('> Ready on http://' + hostname + ':' + port);
  });
});
EOL

# Update package.json scripts
if ! grep -q '"start":' "$DEPLOY_DIR/frontend/package.json"; then
    sed -i '"scripts": {/a\    "start": "NODE_ENV=production node server.js",' "$DEPLOY_DIR/frontend/package.json"
fi

# Install dependencies for backend
print_status "Installing backend dependencies..."
cd "$DEPLOY_DIR/backend" && composer install --no-dev --optimize-autoloader

# Enable Apache modules
print_status "Enabling Apache modules..."
a2enmod proxy proxy_http ssl headers rewrite

# Enable site
print_status "Enabling site..."
a2ensite demo-medgnosis.conf

# Enable services
print_status "Enabling services..."
systemctl enable nextjs.service
systemctl enable laravel.service

# Restart services
print_status "Restarting services..."

# Restart and verify Apache
systemctl restart apache2
if ! systemctl is-active --quiet apache2; then
    print_error "Failed to start Apache service"
fi

# Clear Laravel cache and optimize
cd "$DEPLOY_DIR/backend"
php artisan config:clear
php artisan cache:clear
php artisan route:clear
php artisan view:clear
php artisan optimize

# Restart and verify Next.js
systemctl daemon-reload
systemctl restart nextjs
sleep 5  # Give it time to start

# Check Next.js status and logs
if ! systemctl is-active --quiet nextjs; then
    print_warning "Next.js service failed to start. Checking logs..."
    journalctl -u nextjs -n 50
    tail -n 50 /var/log/nextjs/error.log
    print_error "Failed to start Next.js service"
fi

# Test Next.js
if ! curl -s http://localhost:3001 > /dev/null; then
    print_warning "Next.js service is not responding"
    print_status "Checking Next.js logs..."
    journalctl -u nextjs -n 50
    tail -n 50 /var/log/nextjs/error.log
    print_error "Next.js service is not accessible"
fi

# Restart and verify Laravel
systemctl restart laravel
sleep 5  # Give it time to start
if ! systemctl is-active --quiet laravel; then
    print_warning "Laravel service failed to start. Checking logs..."
    journalctl -u laravel -n 50
    tail -n 50 /var/log/laravel/error.log
    print_error "Failed to start Laravel service"
fi

# Test Laravel
if ! curl -s http://localhost:8001/api/test > /dev/null; then
    print_warning "Laravel service is not responding"
    print_status "Checking Laravel logs..."
    journalctl -u laravel -n 50
    tail -n 50 /var/log/laravel/error.log
    print_error "Laravel service is not accessible"
fi

print_status "Deployment completed successfully!"
print_status "You can now access the application at https://demo.medgnosis.app"
print_status "To test the deployment, run: ./test-local-deploy.sh"
