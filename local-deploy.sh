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

# Copy frontend files
print_status "Copying frontend files..."
rsync -av --exclude="node_modules" --exclude=".next" "$REPO_DIR/frontend/" "$DEPLOY_DIR/frontend/"

# Copy backend files
print_status "Copying backend files..."
rsync -av --exclude="vendor" --exclude="node_modules" "$REPO_DIR/backend/" "$DEPLOY_DIR/backend/"

# Set up frontend environment
print_status "Setting up frontend environment..."
cat > "$DEPLOY_DIR/frontend/.env" << EOL
NEXT_PUBLIC_API_URL=https://demo.medgnosis.app/api
EOL

# Set up backend environment
print_status "Setting up backend environment..."
cat > "$DEPLOY_DIR/backend/.env" << EOL
APP_NAME=Medgnosis
APP_ENV=production
APP_KEY=base64:Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Y
APP_DEBUG=false
APP_URL=https://demo.medgnosis.app

LOG_CHANNEL=stack
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=debug

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

MEMCACHED_HOST=127.0.0.1

REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379

MAIL_MAILER=smtp
MAIL_HOST=mailpit
MAIL_PORT=1025
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_ENCRYPTION=null
MAIL_FROM_ADDRESS="hello@example.com"
MAIL_FROM_NAME="\${APP_NAME}"

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=
AWS_USE_PATH_STYLE_ENDPOINT=false

PUSHER_APP_ID=
PUSHER_APP_KEY=
PUSHER_APP_SECRET=
PUSHER_HOST=
PUSHER_PORT=443
PUSHER_SCHEME=https
PUSHER_APP_CLUSTER=mt1

VITE_APP_NAME="\${APP_NAME}"
VITE_PUSHER_APP_KEY="\${PUSHER_APP_KEY}"
VITE_PUSHER_HOST="\${PUSHER_HOST}"
VITE_PUSHER_PORT="\${PUSHER_PORT}"
VITE_PUSHER_SCHEME="\${PUSHER_SCHEME}"
VITE_PUSHER_APP_CLUSTER="\${PUSHER_APP_CLUSTER}"

SANCTUM_STATEFUL_DOMAINS=demo.medgnosis.app
SESSION_DOMAIN=.demo.medgnosis.app
EOL

# Set up API routes
print_status "Setting up API routes..."
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

# Set up AuthController
print_status "Setting up AuthController..."
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
cat > "$NEXTJS_SERVICE" << EOL
[Unit]
Description=Next.js Production Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$DEPLOY_DIR/frontend
ExecStart=/usr/bin/node $DEPLOY_DIR/frontend/server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
EOL

# Set up Laravel service
print_status "Setting up Laravel service..."
cat > "$LARAVEL_SERVICE" << EOL
[Unit]
Description=Laravel Production Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$DEPLOY_DIR/backend
ExecStart=/usr/bin/php -S 0.0.0.0:8001 -t $DEPLOY_DIR/backend/public
Restart=on-failure
Environment=APP_ENV=production

[Install]
WantedBy=multi-user.target
EOL

# Set permissions
print_status "Setting permissions..."
chown -R www-data:www-data "$DEPLOY_DIR"
chmod -R 755 "$DEPLOY_DIR"

# Install dependencies for frontend
print_status "Installing frontend dependencies..."
cd "$DEPLOY_DIR/frontend" && npm install

# Build frontend
print_status "Building frontend..."
cd "$DEPLOY_DIR/frontend" && npm run build

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
systemctl restart apache2
systemctl restart nextjs
systemctl restart laravel

print_status "Deployment completed successfully!"
print_status "You can now access the application at https://demo.medgnosis.app"
print_status "To test the deployment, run: ./test-local-deploy.sh"
