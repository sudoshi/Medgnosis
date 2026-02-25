#!/bin/bash

# Enhanced deployment script for Medgnosis
# This script provides a fast and flawless way to update the local Apache2 application deployment
# with options to update only the frontend, backend, or both.

# ======================================
# CONFIGURATION
# ======================================

# Default configuration
DOMAIN="demo.medgnosis.app"
DEPLOY_DIR="/var/www/Medgnosis"
REPO_DIR=$(pwd)
APACHE_CONF="/etc/apache2/sites-available/demo-medgnosis.conf"
NEXTJS_SERVICE="/etc/systemd/system/nextjs.service"
LARAVEL_SERVICE="/etc/systemd/system/laravel.service"
BACKUP_DIR="/var/www/Medgnosis-backups"
LOG_DIR="/var/log/medgnosis-deploy"
LOG_FILE="${LOG_DIR}/deploy-$(date +%Y%m%d-%H%M%S).log"

# Default options
DEPLOY_FRONTEND=false
DEPLOY_BACKEND=false
VERBOSE=false
QUICK_MODE=false
SKIP_TESTS=false
CREATE_BACKUP=true
FORCE_DEPENDENCIES=false
INTERACTIVE=true
SHOW_HELP=false

# Checksums file for tracking changes
CHECKSUM_FILE="${DEPLOY_DIR}/.deploy-checksums"

# ======================================
# UTILITY FUNCTIONS
# ======================================

# Colors for output
RESET='\033[0m'
BLACK='\033[0;30m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[0;37m'
BOLD='\033[1m'
UNDERLINE='\033[4m'

# Function to print status messages
print_status() {
    echo -e "${GREEN}[INFO]${RESET} $1"
    log_message "INFO: $1"
}

# Function to print error messages
print_error() {
    echo -e "${RED}[ERROR]${RESET} $1"
    log_message "ERROR: $1"
    if [ "$2" = "exit" ]; then
        exit 1
    fi
}

# Function to print warning messages
print_warning() {
    echo -e "${YELLOW}[WARNING]${RESET} $1"
    log_message "WARNING: $1"
}

# Function to print success messages
print_success() {
    echo -e "${GREEN}[SUCCESS]${RESET} $1"
    log_message "SUCCESS: $1"
}

# Function to print verbose messages
print_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${BLUE}[VERBOSE]${RESET} $1"
        log_message "VERBOSE: $1"
    fi
}

# Function to print section headers
print_section() {
    echo -e "\n${MAGENTA}${BOLD}=== $1 ===${RESET}"
    log_message "SECTION: $1"
}

# Function to log messages to file
log_message() {
    mkdir -p "${LOG_DIR}"
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] $1" >> "${LOG_FILE}"
}

# Function to show spinner for long-running tasks
show_spinner() {
    local pid=$1
    local message=$2
    local spin='-\|/'
    local i=0
    
    echo -ne "${CYAN}[WAIT]${RESET} $message "
    
    while kill -0 $pid 2>/dev/null; do
        i=$(( (i+1) % 4 ))
        echo -ne "\b${spin:$i:1}"
        sleep 0.1
    done
    
    echo -ne "\b${GREEN}✓${RESET}\n"
}

# Function to ask for confirmation
confirm() {
    local message=$1
    local default=${2:-Y}
    
    if [ "$default" = "Y" ]; then
        options="[Y/n]"
    else
        options="[y/N]"
    fi
    
    read -p "$message $options " response
    response=${response:-$default}
    
    if [[ "$response" =~ ^[Yy]$ ]]; then
        return 0
    else
        return 1
    fi
}

# Function to calculate checksum of a file
calculate_checksum() {
    if [ -f "$1" ]; then
        md5sum "$1" | awk '{print $1}'
    else
        echo "file_not_found"
    fi
}

# Function to save checksums
save_checksums() {
    mkdir -p "$(dirname "${CHECKSUM_FILE}")"
    
    # Frontend checksums
    FRONTEND_PACKAGE_CHECKSUM=$(calculate_checksum "${REPO_DIR}/frontend/package.json")
    FRONTEND_LOCK_CHECKSUM=$(calculate_checksum "${REPO_DIR}/frontend/package-lock.json")
    FRONTEND_CONFIG_CHECKSUM=$(calculate_checksum "${REPO_DIR}/frontend/next.config.js")
    
    # Backend checksums
    BACKEND_COMPOSER_CHECKSUM=$(calculate_checksum "${REPO_DIR}/backend/composer.json")
    BACKEND_LOCK_CHECKSUM=$(calculate_checksum "${REPO_DIR}/backend/composer.lock")
    BACKEND_ENV_CHECKSUM=$(calculate_checksum "${REPO_DIR}/backend/.env.production")
    
    # Save checksums to file
    cat > "${CHECKSUM_FILE}" << EOL
FRONTEND_PACKAGE_CHECKSUM=${FRONTEND_PACKAGE_CHECKSUM}
FRONTEND_LOCK_CHECKSUM=${FRONTEND_LOCK_CHECKSUM}
FRONTEND_CONFIG_CHECKSUM=${FRONTEND_CONFIG_CHECKSUM}
BACKEND_COMPOSER_CHECKSUM=${BACKEND_COMPOSER_CHECKSUM}
BACKEND_LOCK_CHECKSUM=${BACKEND_LOCK_CHECKSUM}
BACKEND_ENV_CHECKSUM=${BACKEND_ENV_CHECKSUM}
LAST_DEPLOY_DATE=$(date +"%Y-%m-%d %H:%M:%S")
EOL

    print_verbose "Saved checksums to ${CHECKSUM_FILE}"
}

# Function to load checksums
load_checksums() {
    if [ -f "${CHECKSUM_FILE}" ]; then
        source "${CHECKSUM_FILE}"
        print_verbose "Loaded checksums from ${CHECKSUM_FILE}"
        return 0
    else
        print_verbose "No checksum file found at ${CHECKSUM_FILE}"
        return 1
    fi
}

# Function to check if dependencies need updating
check_dependencies_changed() {
    local component=$1
    
    load_checksums
    
    if [ "$component" = "frontend" ]; then
        local current_package=$(calculate_checksum "${REPO_DIR}/frontend/package.json")
        local current_lock=$(calculate_checksum "${REPO_DIR}/frontend/package-lock.json")
        
        if [ "$current_package" != "${FRONTEND_PACKAGE_CHECKSUM}" ] || [ "$current_lock" != "${FRONTEND_LOCK_CHECKSUM}" ]; then
            print_verbose "Frontend dependencies have changed"
            return 0
        else
            print_verbose "Frontend dependencies have not changed"
            return 1
        fi
    elif [ "$component" = "backend" ]; then
        local current_composer=$(calculate_checksum "${REPO_DIR}/backend/composer.json")
        local current_lock=$(calculate_checksum "${REPO_DIR}/backend/composer.lock")
        
        if [ "$current_composer" != "${BACKEND_COMPOSER_CHECKSUM}" ] || [ "$current_lock" != "${BACKEND_LOCK_CHECKSUM}" ]; then
            print_verbose "Backend dependencies have changed"
            return 0
        else
            print_verbose "Backend dependencies have not changed"
            return 1
        fi
    fi
    
    # Default to true if component not recognized or checksums not found
    return 0
}

# Function to create a backup
create_backup() {
    print_section "Creating Backup"
    
    if [ "$CREATE_BACKUP" = false ]; then
        print_warning "Backup creation skipped due to --no-backup flag"
        return 0
    fi
    
    local timestamp=$(date +"%Y%m%d-%H%M%S")
    local backup_path="${BACKUP_DIR}/${timestamp}"
    
    print_status "Creating backup at ${backup_path}"
    
    # Create backup directory
    mkdir -p "${backup_path}"
    
    # Backup frontend
    if [ -d "${DEPLOY_DIR}/frontend" ]; then
        print_verbose "Backing up frontend..."
        mkdir -p "${backup_path}/frontend"
        rsync -a --exclude="node_modules" --exclude=".next" "${DEPLOY_DIR}/frontend/" "${backup_path}/frontend/"
    fi
    
    # Backup backend
    if [ -d "${DEPLOY_DIR}/backend" ]; then
        print_verbose "Backing up backend..."
        mkdir -p "${backup_path}/backend"
        rsync -a --exclude="vendor" --exclude="node_modules" "${DEPLOY_DIR}/backend/" "${backup_path}/backend/"
    fi
    
    # Backup Apache configuration
    if [ -f "${APACHE_CONF}" ]; then
        print_verbose "Backing up Apache configuration..."
        mkdir -p "${backup_path}/config"
        cp "${APACHE_CONF}" "${backup_path}/config/"
    fi
    
    # Backup systemd services
    if [ -f "${NEXTJS_SERVICE}" ]; then
        print_verbose "Backing up Next.js service..."
        mkdir -p "${backup_path}/config"
        cp "${NEXTJS_SERVICE}" "${backup_path}/config/"
    fi
    
    if [ -f "${LARAVEL_SERVICE}" ]; then
        print_verbose "Backing up Laravel service..."
        mkdir -p "${backup_path}/config"
        cp "${LARAVEL_SERVICE}" "${backup_path}/config/"
    fi
    
    # Create backup info file
    cat > "${backup_path}/backup-info.txt" << EOL
Backup created: $(date)
Deployment directory: ${DEPLOY_DIR}
Domain: ${DOMAIN}
EOL
    
    # Create symlink to latest backup
    ln -sf "${backup_path}" "${BACKUP_DIR}/latest"
    
    print_success "Backup created successfully at ${backup_path}"
    echo "To restore this backup, run: ./enhanced-deploy.sh --restore=${timestamp}"
    
    # Return the backup path
    echo "${backup_path}"
}

# Function to restore from backup
restore_backup() {
    local backup_id=$1
    local backup_path
    
    if [ "$backup_id" = "latest" ]; then
        backup_path="${BACKUP_DIR}/latest"
        if [ ! -d "${backup_path}" ]; then
            print_error "No latest backup found" "exit"
        fi
    else
        backup_path="${BACKUP_DIR}/${backup_id}"
        if [ ! -d "${backup_path}" ]; then
            print_error "Backup ${backup_id} not found" "exit"
        fi
    fi
    
    print_section "Restoring from Backup: ${backup_path}"
    
    # Confirm restoration
    if [ "$INTERACTIVE" = true ]; then
        if ! confirm "Are you sure you want to restore from backup ${backup_id}?"; then
            print_warning "Backup restoration cancelled"
            return 1
        fi
    fi
    
    # Stop services
    print_status "Stopping services..."
    systemctl stop nextjs laravel apache2
    
    # Restore frontend
    if [ -d "${backup_path}/frontend" ]; then
        print_status "Restoring frontend..."
        rsync -a "${backup_path}/frontend/" "${DEPLOY_DIR}/frontend/"
    fi
    
    # Restore backend
    if [ -d "${backup_path}/backend" ]; then
        print_status "Restoring backend..."
        rsync -a "${backup_path}/backend/" "${DEPLOY_DIR}/backend/"
    fi
    
    # Restore Apache configuration
    if [ -f "${backup_path}/config/$(basename ${APACHE_CONF})" ]; then
        print_status "Restoring Apache configuration..."
        cp "${backup_path}/config/$(basename ${APACHE_CONF})" "${APACHE_CONF}"
    fi
    
    # Restore systemd services
    if [ -f "${backup_path}/config/$(basename ${NEXTJS_SERVICE})" ]; then
        print_status "Restoring Next.js service..."
        cp "${backup_path}/config/$(basename ${NEXTJS_SERVICE})" "${NEXTJS_SERVICE}"
    fi
    
    if [ -f "${backup_path}/config/$(basename ${LARAVEL_SERVICE})" ]; then
        print_status "Restoring Laravel service..."
        cp "${backup_path}/config/$(basename ${LARAVEL_SERVICE})" "${LARAVEL_SERVICE}"
    fi
    
    # Restart services
    print_status "Restarting services..."
    systemctl daemon-reload
    systemctl start apache2
    systemctl start nextjs
    systemctl start laravel
    
    print_success "Backup restored successfully from ${backup_path}"
    return 0
}

# Function to list available backups
list_backups() {
    print_section "Available Backups"
    
    if [ ! -d "${BACKUP_DIR}" ]; then
        print_warning "No backups found"
        return 1
    fi
    
    local backups=$(find "${BACKUP_DIR}" -maxdepth 1 -type d -name "2*" | sort -r)
    
    if [ -z "$backups" ]; then
        print_warning "No backups found"
        return 1
    fi
    
    echo -e "${BOLD}ID                  | Date                 | Size${RESET}"
    echo "------------------------------------------------------"
    
    while IFS= read -r backup; do
        local id=$(basename "$backup")
        local date=$(stat -c "%y" "$backup" | cut -d. -f1)
        local size=$(du -sh "$backup" | cut -f1)
        
        echo -e "${id} | ${date} | ${size}"
    done <<< "$backups"
    
    echo ""
    echo "To restore a backup, run: ./enhanced-deploy.sh --restore=<ID>"
    echo "To restore the latest backup, run: ./enhanced-deploy.sh --restore=latest"
    
    return 0
}

# Function to check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "Please run as root" "exit"
    fi
}

# Function to check system requirements
check_requirements() {
    print_section "Checking System Requirements"
    
    # Check if Apache is installed
    if ! command -v apache2 &> /dev/null; then
        print_error "Apache2 is not installed"
        return 1
    else
        print_verbose "Apache2 is installed"
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        return 1
    else
        local node_version=$(node -v)
        print_verbose "Node.js is installed (${node_version})"
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        return 1
    else
        local npm_version=$(npm -v)
        print_verbose "npm is installed (${npm_version})"
    fi
    
    # Check if PHP is installed
    if ! command -v php &> /dev/null; then
        print_error "PHP is not installed"
        return 1
    else
        local php_version=$(php -v | head -n 1 | cut -d' ' -f2)
        print_verbose "PHP is installed (${php_version})"
    fi
    
    # Check if Composer is installed
    if ! command -v composer &> /dev/null; then
        print_error "Composer is not installed"
        return 1
    else
        local composer_version=$(composer --version | cut -d' ' -f3)
        print_verbose "Composer is installed (${composer_version})"
    fi
    
    # Check if rsync is installed
    if ! command -v rsync &> /dev/null; then
        print_error "rsync is not installed"
        return 1
    else
        print_verbose "rsync is installed"
    fi
    
    # Check if required Apache modules are installed
    local required_modules=("proxy" "proxy_http" "ssl" "headers" "rewrite")
    local missing_modules=()
    
    for module in "${required_modules[@]}"; do
        if ! apache2ctl -M 2>/dev/null | grep -q "${module}_module"; then
            missing_modules+=("$module")
        fi
    done
    
    if [ ${#missing_modules[@]} -gt 0 ]; then
        print_warning "The following Apache modules are not enabled: ${missing_modules[*]}"
        print_status "Enabling missing Apache modules..."
        
        for module in "${missing_modules[@]}"; do
            a2enmod "$module"
            print_verbose "Enabled Apache module: $module"
        done
    else
        print_verbose "All required Apache modules are enabled"
    fi
    
    # Check if deployment directory exists
    if [ ! -d "${DEPLOY_DIR}" ]; then
        print_warning "Deployment directory ${DEPLOY_DIR} does not exist"
        print_status "Creating deployment directory..."
        mkdir -p "${DEPLOY_DIR}"
    else
        print_verbose "Deployment directory exists: ${DEPLOY_DIR}"
    fi
    
    # Check if SSL certificates exist
    local ssl_cert="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
    local ssl_key="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
    
    if [ ! -f "$ssl_cert" ] || [ ! -f "$ssl_key" ]; then
        print_warning "SSL certificates not found for ${DOMAIN}"
        print_warning "You may need to run: certbot --apache -d ${DOMAIN}"
    else
        print_verbose "SSL certificates found for ${DOMAIN}"
    fi
    
    print_success "System requirements check completed"
    return 0
}

# ======================================
# DEPLOYMENT FUNCTIONS
# ======================================

# Function to deploy frontend
deploy_frontend() {
    print_section "Deploying Frontend"
    
    # Create frontend directory if it doesn't exist
    if [ ! -d "${DEPLOY_DIR}/frontend" ]; then
        print_status "Creating frontend directory..."
        mkdir -p "${DEPLOY_DIR}/frontend"
    fi
    
    # Copy frontend files
    print_status "Copying frontend files..."
    rsync -av --delete --exclude="node_modules" --exclude=".next" "${REPO_DIR}/frontend/" "${DEPLOY_DIR}/frontend/"
    
    # Set up frontend environment
    print_status "Setting up frontend environment..."
    cat > "${DEPLOY_DIR}/frontend/.env" << EOL
NEXT_PUBLIC_API_URL=https://${DOMAIN}/api
NEXT_PUBLIC_APP_URL=https://${DOMAIN}
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
EOL
    
    # Install dependencies if needed
    if [ "$QUICK_MODE" = true ] && ! check_dependencies_changed "frontend" && [ "$FORCE_DEPENDENCIES" = false ]; then
        print_status "Skipping frontend dependency installation (no changes detected)"
    else
        print_status "Installing frontend dependencies..."
        cd "${DEPLOY_DIR}/frontend"
        npm ci &
        show_spinner $! "Installing frontend dependencies..."
    fi
    
    # Build frontend
    print_status "Building frontend..."
    cd "${DEPLOY_DIR}/frontend"
    npm run build &
    show_spinner $! "Building frontend application..."
    
    # Set permissions
    print_status "Setting frontend permissions..."
    chown -R www-data:www-data "${DEPLOY_DIR}/frontend"
    chmod -R 755 "${DEPLOY_DIR}/frontend"
    
    print_success "Frontend deployment completed"
    return 0
}

# Function to deploy backend
deploy_backend() {
    print_section "Deploying Backend"
    
    # Create backend directory if it doesn't exist
    if [ ! -d "${DEPLOY_DIR}/backend" ]; then
        print_status "Creating backend directory..."
        mkdir -p "${DEPLOY_DIR}/backend"
    fi
    
    # Copy backend files
    print_status "Copying backend files..."
    rsync -av --delete --exclude="vendor" --exclude="node_modules" --exclude=".env" "${REPO_DIR}/backend/" "${DEPLOY_DIR}/backend/"
    
    # Handle backend environment
    if [ -f "${DEPLOY_DIR}/backend/.env" ]; then
        print_status "Existing backend .env found, preserving it..."
        
        # Backup the existing .env file
        cp "${DEPLOY_DIR}/backend/.env" "${DEPLOY_DIR}/backend/.env.backup"
        
        # Check if APP_KEY is the placeholder or empty
        CURRENT_APP_KEY=$(grep "^APP_KEY=" "${DEPLOY_DIR}/backend/.env" | cut -d= -f2)
        
        if [[ "$CURRENT_APP_KEY" == "base64:Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Y" || -z "$CURRENT_APP_KEY" ]]; then
            print_status "Invalid APP_KEY detected, generating a new one..."
            
            # Generate a new APP_KEY using openssl directly
            print_status "Generating a new APP_KEY..."
            SECURE_KEY="base64:$(openssl rand -base64 32)"
            
            # Update the APP_KEY in the .env file
            sed -i "s|^APP_KEY=.*|APP_KEY=$SECURE_KEY|g" "${DEPLOY_DIR}/backend/.env"
            print_status "Set APP_KEY to: $SECURE_KEY"
        fi
        
        # Ensure PostgreSQL connection details are correctly set
        print_status "Ensuring database connection details are correct..."
        sed -i "s|^DB_CONNECTION=.*|DB_CONNECTION=pgsql|" "${DEPLOY_DIR}/backend/.env"
        sed -i "s|^DB_HOST=.*|DB_HOST=localhost|" "${DEPLOY_DIR}/backend/.env"
        sed -i "s|^DB_PORT=.*|DB_PORT=5432|" "${DEPLOY_DIR}/backend/.env"
        sed -i "s|^DB_DATABASE=.*|DB_DATABASE=PHM|" "${DEPLOY_DIR}/backend/.env"
        sed -i "s|^DB_USERNAME=.*|DB_USERNAME=postgres|" "${DEPLOY_DIR}/backend/.env"
        sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=acumenus|" "${DEPLOY_DIR}/backend/.env"
        
        # Ensure DB_SCHEMA is set
        if ! grep -q "^DB_SCHEMA=" "${DEPLOY_DIR}/backend/.env"; then
            echo "DB_SCHEMA=prod" >> "${DEPLOY_DIR}/backend/.env"
        else
            sed -i "s|^DB_SCHEMA=.*|DB_SCHEMA=prod|" "${DEPLOY_DIR}/backend/.env"
        fi
        
        # Ensure CORS settings are correct
        if ! grep -q "^CORS_ALLOWED_ORIGINS=" "${DEPLOY_DIR}/backend/.env"; then
            echo "CORS_ALLOWED_ORIGINS=https://${DOMAIN}" >> "${DEPLOY_DIR}/backend/.env"
        else
            sed -i "s|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=https://${DOMAIN}|" "${DEPLOY_DIR}/backend/.env"
        fi
        
        # Ensure Sanctum settings are correct
        if ! grep -q "^SANCTUM_STATEFUL_DOMAINS=" "${DEPLOY_DIR}/backend/.env"; then
            echo "SANCTUM_STATEFUL_DOMAINS=${DOMAIN}" >> "${DEPLOY_DIR}/backend/.env"
        else
            sed -i "s|^SANCTUM_STATEFUL_DOMAINS=.*|SANCTUM_STATEFUL_DOMAINS=${DOMAIN}|" "${DEPLOY_DIR}/backend/.env"
        fi
        
        if ! grep -q "^SESSION_DOMAIN=" "${DEPLOY_DIR}/backend/.env"; then
            echo "SESSION_DOMAIN=.${DOMAIN}" >> "${DEPLOY_DIR}/backend/.env"
        else
            sed -i "s|^SESSION_DOMAIN=.*|SESSION_DOMAIN=.${DOMAIN}|" "${DEPLOY_DIR}/backend/.env"
        fi
        
        # Update the repository's .env file with the valid APP_KEY for future deployments
        if [ -f "${REPO_DIR}/backend/.env" ]; then
            VALID_APP_KEY=$(grep "^APP_KEY=" "${DEPLOY_DIR}/backend/.env" | cut -d= -f2)
            sed -i "s|^APP_KEY=.*|APP_KEY=$VALID_APP_KEY|" "${REPO_DIR}/backend/.env"
            print_verbose "Updated repository's .env with valid APP_KEY for future deployments"
        fi
    else
        print_status "No existing backend .env found, creating a new one..."
        
        # Create a new .env file
        cat > "${DEPLOY_DIR}/backend/.env" << EOL
APP_NAME=Medgnosis
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://${DOMAIN}

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

SANCTUM_STATEFUL_DOMAINS=${DOMAIN}
SESSION_DOMAIN=.${DOMAIN}
FRONTEND_URL=https://${DOMAIN}

CORS_ALLOWED_ORIGINS=https://${DOMAIN}
EOL
        
        # Generate a new APP_KEY
        cd "${DEPLOY_DIR}/backend"
        SECURE_KEY="base64:$(openssl rand -base64 32)"
        sed -i "s|^APP_KEY=.*|APP_KEY=$SECURE_KEY|g" "${DEPLOY_DIR}/backend/.env"
        print_status "Generated new APP_KEY: $SECURE_KEY"
        
        # Update the repository's .env file with the valid APP_KEY for future deployments
        if [ -f "${REPO_DIR}/backend/.env" ]; then
            sed -i "s|^APP_KEY=.*|APP_KEY=$SECURE_KEY|" "${REPO_DIR}/backend/.env"
            print_verbose "Updated repository's .env with valid APP_KEY for future deployments"
        fi
    fi
    
    # Preserve API routes and controllers
    print_status "Checking API routes and controllers..."
    
    # Only create API routes file if it doesn't exist
    if [ ! -f "${DEPLOY_DIR}/backend/routes/api.php" ]; then
        print_status "Creating default API routes..."
        mkdir -p "${DEPLOY_DIR}/backend/routes"
        cat > "${DEPLOY_DIR}/backend/routes/api.php" << EOL
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
    else
        print_verbose "API routes file already exists, preserving it"
    fi
    
    # Only create AuthController if it doesn't exist
    if [ ! -f "${DEPLOY_DIR}/backend/app/Http/Controllers/AuthController.php" ]; then
        print_status "Creating default AuthController..."
        mkdir -p "${DEPLOY_DIR}/backend/app/Http/Controllers"
        cat > "${DEPLOY_DIR}/backend/app/Http/Controllers/AuthController.php" << EOL
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
    
    # Install dependencies if needed
    if [ "$QUICK_MODE" = true ] && ! check_dependencies_changed "backend" && [ "$FORCE_DEPENDENCIES" = false ]; then
        print_status "Skipping backend dependency installation (no changes detected)"
    else
        print_status "Installing backend dependencies..."
        cd "${DEPLOY_DIR}/backend"
        composer install --no-dev --optimize-autoloader &
        show_spinner $! "Installing backend dependencies..."
    fi
    
    # Clear Laravel caches
    print_status "Clearing Laravel caches..."
    cd "${DEPLOY_DIR}/backend"
    php artisan config:clear
    php artisan cache:clear
    php artisan route:clear
    php artisan view:clear
    
    # Set permissions
    print_status "Setting backend permissions..."
    chown -R www-data:www-data "${DEPLOY_DIR}/backend"
    chmod -R 755 "${DEPLOY_DIR}/backend"
    chmod -R 775 "${DEPLOY_DIR}/backend/storage"
    
    print_success "Backend deployment completed"
    return 0
}

# Function to configure Apache
configure_apache() {
    print_section "Configuring Apache"
    
    print_status "Setting up Apache configuration..."
    cat > "${APACHE_CONF}" << EOL
# Redirect all HTTP traffic to HTTPS
<VirtualHost *:80>
    ServerName ${DOMAIN}
    Redirect permanent / https://${DOMAIN}/
</VirtualHost>

<VirtualHost *:443>
    ServerName ${DOMAIN}
    ServerAdmin webmaster@${DOMAIN}
    
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
        SetEnvIfNoCase Origin "^(https://${DOMAIN}\.?)" ORIGIN=\$1
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
    SSLCertificateFile /etc/letsencrypt/live/${DOMAIN}/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/${DOMAIN}/privkey.pem
</VirtualHost>
EOL
    
    print_status "Enabling Apache site..."
    a2ensite $(basename "${APACHE_CONF}" .conf)
    
    print_success "Apache configuration completed"
    return 0
}

# Function to configure systemd services
configure_services() {
    print_section "Configuring Systemd Services"
    
    # Set up Next.js service
    print_status "Setting up Next.js service..."
    cat > "${NEXTJS_SERVICE}" << EOL
[Unit]
Description=Next.js Production Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=${DEPLOY_DIR}/frontend
ExecStart=/usr/bin/node ${DEPLOY_DIR}/frontend/server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
EOL
    
    # Set up Laravel service
    print_status "Setting up Laravel service..."
    cat > "${LARAVEL_SERVICE}" << EOL
[Unit]
Description=Laravel Production Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=${DEPLOY_DIR}/backend
ExecStart=/usr/bin/php -S 0.0.0.0:8001 -t ${DEPLOY_DIR}/backend/public
Restart=on-failure
Environment=APP_ENV=production

[Install]
WantedBy=multi-user.target
EOL
    
    print_status "Enabling services..."
    systemctl daemon-reload
    systemctl enable nextjs.service
    systemctl enable laravel.service
    
    print_success "Service configuration completed"
    return 0
}

# Function to manage services
manage_services() {
    print_section "Managing Services"
    
    # Check if services need to be restarted
    local restart_apache=false
    local restart_nextjs=false
    local restart_laravel=false
    
    # Check if Apache configuration has changed
    if [ -f "${APACHE_CONF}" ]; then
        local apache_checksum_old=$(calculate_checksum "${APACHE_CONF}")
        local apache_checksum_new=$(calculate_checksum "${APACHE_CONF}.new" 2>/dev/null)
        
        if [ "$apache_checksum_old" != "$apache_checksum_new" ]; then
            restart_apache=true
            print_verbose "Apache configuration has changed, will restart"
        fi
    else
        restart_apache=true
        print_verbose "Apache configuration is new, will restart"
    fi
    
    # Check if Next.js service has changed
    if [ -f "${NEXTJS_SERVICE}" ]; then
        local nextjs_checksum_old=$(calculate_checksum "${NEXTJS_SERVICE}")
        local nextjs_checksum_new=$(calculate_checksum "${NEXTJS_SERVICE}.new" 2>/dev/null)
        
        if [ "$nextjs_checksum_old" != "$nextjs_checksum_new" ]; then
            restart_nextjs=true
            print_verbose "Next.js service has changed, will restart"
        fi
    else
        restart_nextjs=true
        print_verbose "Next.js service is new, will restart"
    fi
    
    # Check if Laravel service has changed
    if [ -f "${LARAVEL_SERVICE}" ]; then
        local laravel_checksum_old=$(calculate_checksum "${LARAVEL_SERVICE}")
        local laravel_checksum_new=$(calculate_checksum "${LARAVEL_SERVICE}.new" 2>/dev/null)
        
        if [ "$laravel_checksum_old" != "$laravel_checksum_new" ]; then
            restart_laravel=true
            print_verbose "Laravel service has changed, will restart"
        fi
    else
        restart_laravel=true
        print_verbose "Laravel service is new, will restart"
    fi
    
    # Always restart services if frontend or backend was deployed
    if [ "$DEPLOY_FRONTEND" = true ]; then
        restart_nextjs=true
        print_verbose "Frontend was deployed, will restart Next.js service"
    fi
    
    if [ "$DEPLOY_BACKEND" = true ]; then
        restart_laravel=true
        print_verbose "Backend was deployed, will restart Laravel service"
    fi
    
    # Restart services if needed
    if [ "$restart_apache" = true ]; then
        print_status "Restarting Apache..."
        systemctl restart apache2
    else
        print_status "Apache configuration unchanged, skipping restart"
    fi
    
    if [ "$restart_nextjs" = true ]; then
        print_status "Restarting Next.js service..."
        systemctl restart nextjs
    else
        print_status "Next.js service unchanged, skipping restart"
    fi
    
    if [ "$restart_laravel" = true ]; then
        print_status "Restarting Laravel service..."
        systemctl restart laravel
    else
        print_status "Laravel service unchanged, skipping restart"
    fi
    
    print_success "Service management completed"
    return 0
}

# Function to run post-deployment tests
run_tests() {
    print_section "Running Post-Deployment Tests"
    
    if [ "$SKIP_TESTS" = true ]; then
        print_warning "Tests skipped due to --skip-tests flag"
        return 0
    fi
    
    local test_failures=0
    
    # Check if Apache is running
    print_status "Checking if Apache is running..."
    if systemctl is-active --quiet apache2; then
        print_success "Apache is running"
    else
        print_error "Apache is not running"
        test_failures=$((test_failures + 1))
    fi
    
    # Check if Next.js service is running
    print_status "Checking if Next.js service is running..."
    if systemctl is-active --quiet nextjs; then
        print_success "Next.js service is running"
    else
        print_error "Next.js service is not running"
        test_failures=$((test_failures + 1))
    fi
    
    # Check if Laravel service is running
    print_status "Checking if Laravel service is running..."
    if systemctl is-active --quiet laravel; then
        print_success "Laravel service is running"
    else
        print_error "Laravel service is not running"
        test_failures=$((test_failures + 1))
    fi
    
    # Check if domain is accessible
    print_status "Checking if domain is accessible..."
    local domain_status=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/" 2>/dev/null)
    
    if [[ "$domain_status" =~ ^(200|301|302)$ ]]; then
        print_success "Domain is accessible (Status: $domain_status)"
    else
        print_error "Domain is not accessible (Status: $domain_status)"
        test_failures=$((test_failures + 1))
    fi
    
    # Check if API endpoint is accessible
    print_status "Checking if API endpoint is accessible..."
    local api_status=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/api/test" 2>/dev/null)
    
    if [[ "$api_status" =~ ^(200|401|403|404)$ ]]; then
        print_success "API endpoint is accessible (Status: $api_status)"
    else
        print_error "API endpoint is not accessible (Status: $api_status)"
        test_failures=$((test_failures + 1))
    fi
    
    # Check Laravel logs for errors
    print_status "Checking Laravel logs for errors..."
    if [ -f "${DEPLOY_DIR}/backend/storage/logs/laravel.log" ]; then
        local laravel_errors=$(grep -i "error\|exception\|fatal" "${DEPLOY_DIR}/backend/storage/logs/laravel.log" | tail -n 10)
        
        if [ -n "$laravel_errors" ]; then
            print_warning "Found errors in Laravel logs:"
            echo "$laravel_errors"
        else
            print_success "No recent errors found in Laravel logs"
        fi
    else
        print_warning "Laravel log file not found"
    fi
    
    # Check Apache logs for errors
    print_status "Checking Apache logs for errors..."
    if [ -f "/var/log/apache2/error.log" ]; then
        local apache_errors=$(grep -i "error\|exception\|fatal" "/var/log/apache2/error.log" | tail -n 10)
        
        if [ -n "$apache_errors" ]; then
            print_warning "Found errors in Apache logs:"
            echo "$apache_errors"
        else
            print_success "No recent errors found in Apache logs"
        fi
    else
        print_warning "Apache error log file not found"
    fi
    
    # Summary
    if [ "$test_failures" -gt 0 ]; then
        print_error "Tests completed with $test_failures failures"
        return 1
    else
        print_success "All tests passed successfully"
        return 0
    fi
}

# Function to display interactive menu
display_menu() {
    print_section "Medgnosis Deployment Menu"
    
    echo -e "${BOLD}Select deployment option:${RESET}"
    echo "1) Deploy frontend only"
    echo "2) Deploy backend only"
    echo "3) Deploy both frontend and backend"
    echo "4) List available backups"
    echo "5) Restore from backup"
    echo "6) Run tests only"
    echo "7) Exit"
    
    read -p "Enter your choice [1-7]: " choice
    
    case $choice in
        1)
            DEPLOY_FRONTEND=true
            ;;
        2)
            DEPLOY_BACKEND=true
            ;;
        3)
            DEPLOY_FRONTEND=true
            DEPLOY_BACKEND=true
            ;;
        4)
            list_backups
            display_menu
            return
            ;;
        5)
            read -p "Enter backup ID (or 'latest'): " backup_id
            restore_backup "$backup_id"
            exit $?
            ;;
        6)
            run_tests
            exit $?
            ;;
        7)
            print_status "Exiting..."
            exit 0
            ;;
        *)
            print_error "Invalid choice"
            display_menu
            return
            ;;
    esac
    
    # Additional options
    echo ""
    echo -e "${BOLD}Additional options:${RESET}"
    
    if confirm "Enable quick mode? (Skip dependency installation if no changes detected)" "Y"; then
        QUICK_MODE=true
    fi
    
    if confirm "Enable verbose output?" "N"; then
        VERBOSE=true
    fi
    
    if confirm "Skip post-deployment tests?" "N"; then
        SKIP_TESTS=true
    fi
    
    if confirm "Skip backup creation?" "N"; then
        CREATE_BACKUP=false
    fi
    
    if confirm "Force dependency installation?" "N"; then
        FORCE_DEPENDENCIES=true
    fi
}

# Function to parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --frontend-only)
                DEPLOY_FRONTEND=true
                INTERACTIVE=false
                shift
                ;;
            --backend-only)
                DEPLOY_BACKEND=true
                INTERACTIVE=false
                shift
                ;;
            --full)
                DEPLOY_FRONTEND=true
                DEPLOY_BACKEND=true
                INTERACTIVE=false
                shift
                ;;
            --quick)
                QUICK_MODE=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --no-backup)
                CREATE_BACKUP=false
                shift
                ;;
            --force-dependencies)
                FORCE_DEPENDENCIES=true
                shift
                ;;
            --non-interactive)
                INTERACTIVE=false
                shift
                ;;
            --restore=*)
                backup_id="${1#*=}"
                restore_backup "$backup_id"
                exit $?
                ;;
            --list-backups)
                list_backups
                exit $?
                ;;
            --help)
                SHOW_HELP=true
                shift
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # If no deployment option was specified but non-interactive mode is set,
    # default to deploying both frontend and backend
    if [ "$INTERACTIVE" = false ] && [ "$DEPLOY_FRONTEND" = false ] && [ "$DEPLOY_BACKEND" = false ]; then
        DEPLOY_FRONTEND=true
        DEPLOY_BACKEND=true
    fi
}

# Function to show help
show_help() {
    echo "Enhanced Deployment Script for Medgnosis"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --frontend-only       Deploy only the frontend"
    echo "  --backend-only        Deploy only the backend"
    echo "  --full                Deploy both frontend and backend (default)"
    echo "  --quick               Skip dependency installation if no changes detected"
    echo "  --verbose             Show detailed output"
    echo "  --skip-tests          Skip post-deployment tests"
    echo "  --no-backup           Skip backup creation"
    echo "  --force-dependencies  Force dependency installation even if no changes detected"
    echo "  --non-interactive     Run in non-interactive mode"
    echo "  --restore=ID          Restore from backup with the specified ID (or 'latest')"
    echo "  --list-backups        List available backups"
    echo "  --help                Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                  # Interactive mode"
    echo "  $0 --frontend-only --quick          # Deploy only frontend with quick mode"
    echo "  $0 --backend-only --verbose         # Deploy only backend with verbose output"
    echo "  $0 --full --no-backup --skip-tests  # Deploy both without backup or tests"
    echo "  $0 --restore=latest                 # Restore from the latest backup"
    echo "  $0 --list-backups                   # List available backups"
    echo ""
}

# ======================================
# MAIN SCRIPT
# ======================================

# Parse command line arguments
parse_arguments "$@"

# Show help if requested
if [ "$SHOW_HELP" = true ]; then
    show_help
    exit 0
fi

# Check if running as root
check_root

# Display banner
echo -e "${MAGENTA}${BOLD}"
echo "███╗   ███╗███████╗██████╗  ██████╗ ███╗   ██╗ ██████╗ ███████╗██╗███████╗"
echo "████╗ ████║██╔════╝██╔══██╗██╔════╝ ████╗  ██║██╔═══██╗██╔════╝██║██╔════╝"
echo "██╔████╔██║█████╗  ██║  ██║██║  ███╗██╔██╗ ██║██║   ██║███████╗██║███████╗"
echo "██║╚██╔╝██║██╔══╝  ██║  ██║██║   ██║██║╚██╗██║██║   ██║╚════██║██║╚════██║"
echo "██║ ╚═╝ ██║███████╗██████╔╝╚██████╔╝██║ ╚████║╚██████╔╝███████║██║███████║"
echo "╚═╝     ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝╚══════╝"
echo -e "${RESET}"
echo -e "${BOLD}Enhanced Deployment Script${RESET}"
echo "Version 1.0.0"
echo "Current time: $(date)"
echo "Deployment directory: ${DEPLOY_DIR}"
echo "Domain: ${DOMAIN}"
echo ""

# Display interactive menu if in interactive mode
if [ "$INTERACTIVE" = true ]; then
    display_menu
fi

# Check if at least one deployment option is selected
if [ "$DEPLOY_FRONTEND" = false ] && [ "$DEPLOY_BACKEND" = false ]; then
    print_error "No deployment option selected" "exit"
fi

# Start deployment
print_section "Starting Deployment"
print_status "Deployment options:"
echo "  Frontend deployment: $([ "$DEPLOY_FRONTEND" = true ] && echo "Yes" || echo "No")"
echo "  Backend deployment: $([ "$DEPLOY_BACKEND" = true ] && echo "Yes" || echo "No")"
echo "  Quick mode: $([ "$QUICK_MODE" = true ] && echo "Yes" || echo "No")"
echo "  Verbose output: $([ "$VERBOSE" = true ] && echo "Yes" || echo "No")"
echo "  Skip tests: $([ "$SKIP_TESTS" = true ] && echo "Yes" || echo "No")"
echo "  Create backup: $([ "$CREATE_BACKUP" = true ] && echo "Yes" || echo "No")"
echo "  Force dependencies: $([ "$FORCE_DEPENDENCIES" = true ] && echo "Yes" || echo "No")"
echo ""

# Check system requirements
check_requirements

# Create backup
if [ "$CREATE_BACKUP" = true ]; then
    backup_path=$(create_backup)
fi

# Deploy frontend if selected
if [ "$DEPLOY_FRONTEND" = true ]; then
    deploy_frontend
fi

# Deploy backend if selected
if [ "$DEPLOY_BACKEND" = true ]; then
    deploy_backend
fi

# Configure Apache if needed
if [ "$DEPLOY_FRONTEND" = true ] || [ "$DEPLOY_BACKEND" = true ]; then
    configure_apache
    configure_services
fi

# Manage services
manage_services

# Save checksums for future deployments
save_checksums

# Run tests
run_tests
test_result=$?

# Deployment summary
print_section "Deployment Summary"
echo "Deployment completed at: $(date)"
echo "Deployment directory: ${DEPLOY_DIR}"
echo "Domain: ${DOMAIN}"
echo ""

if [ "$test_result" -eq 0 ]; then
    print_success "Deployment completed successfully!"
    echo "You can now access the application at https://${DOMAIN}"
else
    print_warning "Deployment completed with test failures"
    echo "Please check the logs for more information"
    
    if [ "$CREATE_BACKUP" = true ] && [ -n "$backup_path" ]; then
        echo ""
        if confirm "Would you like to rollback to the backup created before deployment?"; then
            restore_backup "latest"
        fi
    fi
fi

exit $test_result
