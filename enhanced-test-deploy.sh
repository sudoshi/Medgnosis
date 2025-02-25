#!/bin/bash

# Enhanced test script for Medgnosis deployment
# This script provides comprehensive testing for the Medgnosis application deployment

# ======================================
# CONFIGURATION
# ======================================

# Default configuration
DOMAIN="demo.medgnosis.app"
DEPLOY_DIR="/var/www/Medgnosis"
LOG_DIR="/var/log/medgnosis-deploy"
LOG_FILE="${LOG_DIR}/test-$(date +%Y%m%d-%H%M%S).log"

# Default options
VERBOSE=false
INTERACTIVE=true
SHOW_HELP=false
TEST_FRONTEND=true
TEST_BACKEND=true
TEST_SERVICES=true
TEST_SECURITY=true
TEST_PERFORMANCE=false

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

# Function to check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "Please run as root" "exit"
    fi
}

# Function to display interactive menu
display_menu() {
    print_section "Medgnosis Test Menu"
    
    echo -e "${BOLD}Select test options:${RESET}"
    echo "1) Test everything"
    echo "2) Test frontend only"
    echo "3) Test backend only"
    echo "4) Test services only"
    echo "5) Test security only"
    echo "6) Exit"
    
    read -p "Enter your choice [1-6]: " choice
    
    case $choice in
        1)
            TEST_FRONTEND=true
            TEST_BACKEND=true
            TEST_SERVICES=true
            TEST_SECURITY=true
            ;;
        2)
            TEST_FRONTEND=true
            TEST_BACKEND=false
            TEST_SERVICES=false
            TEST_SECURITY=false
            ;;
        3)
            TEST_FRONTEND=false
            TEST_BACKEND=true
            TEST_SERVICES=false
            TEST_SECURITY=false
            ;;
        4)
            TEST_FRONTEND=false
            TEST_BACKEND=false
            TEST_SERVICES=true
            TEST_SECURITY=false
            ;;
        5)
            TEST_FRONTEND=false
            TEST_BACKEND=false
            TEST_SERVICES=false
            TEST_SECURITY=true
            ;;
        6)
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
    
    if confirm "Enable verbose output?" "N"; then
        VERBOSE=true
    fi
    
    if confirm "Enable performance testing? (Takes longer)" "N"; then
        TEST_PERFORMANCE=true
    fi
}

# Function to parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --frontend-only)
                TEST_FRONTEND=true
                TEST_BACKEND=false
                TEST_SERVICES=false
                TEST_SECURITY=false
                INTERACTIVE=false
                shift
                ;;
            --backend-only)
                TEST_FRONTEND=false
                TEST_BACKEND=true
                TEST_SERVICES=false
                TEST_SECURITY=false
                INTERACTIVE=false
                shift
                ;;
            --services-only)
                TEST_FRONTEND=false
                TEST_BACKEND=false
                TEST_SERVICES=true
                TEST_SECURITY=false
                INTERACTIVE=false
                shift
                ;;
            --security-only)
                TEST_FRONTEND=false
                TEST_BACKEND=false
                TEST_SERVICES=false
                TEST_SECURITY=true
                INTERACTIVE=false
                shift
                ;;
            --all)
                TEST_FRONTEND=true
                TEST_BACKEND=true
                TEST_SERVICES=true
                TEST_SECURITY=true
                INTERACTIVE=false
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --performance)
                TEST_PERFORMANCE=true
                shift
                ;;
            --non-interactive)
                INTERACTIVE=false
                shift
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
    
    # If no test option was specified but non-interactive mode is set,
    # default to testing everything
    if [ "$INTERACTIVE" = false ] && [ "$TEST_FRONTEND" = false ] && [ "$TEST_BACKEND" = false ] && [ "$TEST_SERVICES" = false ] && [ "$TEST_SECURITY" = false ]; then
        TEST_FRONTEND=true
        TEST_BACKEND=true
        TEST_SERVICES=true
        TEST_SECURITY=true
    fi
}

# Function to show help
show_help() {
    echo "Enhanced Test Script for Medgnosis"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --frontend-only    Test only the frontend"
    echo "  --backend-only     Test only the backend"
    echo "  --services-only    Test only the services"
    echo "  --security-only    Test only security aspects"
    echo "  --all              Test everything (default)"
    echo "  --verbose          Show detailed output"
    echo "  --performance      Include performance tests"
    echo "  --non-interactive  Run in non-interactive mode"
    echo "  --help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Interactive mode"
    echo "  $0 --frontend-only --verbose # Test only frontend with verbose output"
    echo "  $0 --all --performance       # Test everything including performance"
    echo ""
}

# ======================================
# TEST FUNCTIONS
# ======================================

# Function to test services
test_services() {
    print_section "Testing Services"
    
    local test_failures=0
    
    # Check if Apache is running
    print_status "Checking if Apache is running..."
    if systemctl is-active --quiet apache2; then
        print_success "Apache is running"
    else
        print_error "Apache is not running"
        test_failures=$((test_failures + 1))
    fi
    
    # Check Apache configuration
    print_status "Checking Apache configuration..."
    if apache2ctl configtest &>/dev/null; then
        print_success "Apache configuration is valid"
    else
        print_error "Apache configuration is invalid"
        test_failures=$((test_failures + 1))
        
        # Show detailed error if verbose
        if [ "$VERBOSE" = true ]; then
            apache2ctl configtest
        fi
    fi
    
    # Check if Next.js service is running
    print_status "Checking if Next.js service is running..."
    if systemctl is-active --quiet nextjs; then
        print_success "Next.js service is running"
    else
        print_error "Next.js service is not running"
        test_failures=$((test_failures + 1))
    fi
    
    # Check Next.js service logs for errors
    print_status "Checking Next.js service logs for errors..."
    local nextjs_errors=$(journalctl -u nextjs --since "1 hour ago" | grep -i "error\|exception\|fatal" | tail -n 10)
    
    if [ -n "$nextjs_errors" ]; then
        print_warning "Found errors in Next.js service logs:"
        echo "$nextjs_errors"
    else
        print_success "No recent errors found in Next.js service logs"
    fi
    
    # Check if Laravel service is running
    print_status "Checking if Laravel service is running..."
    if systemctl is-active --quiet laravel; then
        print_success "Laravel service is running"
    else
        print_error "Laravel service is not running"
        test_failures=$((test_failures + 1))
    fi
    
    # Check Laravel service logs for errors
    print_status "Checking Laravel service logs for errors..."
    local laravel_errors=$(journalctl -u laravel --since "1 hour ago" | grep -i "error\|exception\|fatal" | tail -n 10)
    
    if [ -n "$laravel_errors" ]; then
        print_warning "Found errors in Laravel service logs:"
        echo "$laravel_errors"
    else
        print_success "No recent errors found in Laravel service logs"
    fi
    
    # Check Laravel application logs for errors
    print_status "Checking Laravel application logs for errors..."
    if [ -f "${DEPLOY_DIR}/backend/storage/logs/laravel.log" ]; then
        local laravel_app_errors=$(grep -i "error\|exception\|fatal" "${DEPLOY_DIR}/backend/storage/logs/laravel.log" | tail -n 10)
        
        if [ -n "$laravel_app_errors" ]; then
            print_warning "Found errors in Laravel application logs:"
            echo "$laravel_app_errors"
        else
            print_success "No recent errors found in Laravel application logs"
        fi
    else
        print_warning "Laravel application log file not found"
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
        print_error "Service tests completed with $test_failures failures"
        return 1
    else
        print_success "All service tests passed successfully"
        return 0
    fi
}

# Function to test frontend
test_frontend() {
    print_section "Testing Frontend"
    
    local test_failures=0
    
    # Check if domain is accessible
    print_status "Checking if domain is accessible..."
    local domain_status=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/" 2>/dev/null)
    
    if [[ "$domain_status" =~ ^(200|301|302)$ ]]; then
        print_success "Domain is accessible (Status: $domain_status)"
    else
        print_error "Domain is not accessible (Status: $domain_status)"
        test_failures=$((test_failures + 1))
    fi
    
    # Check if frontend loads correctly
    print_status "Checking if frontend loads correctly..."
    local frontend_content=$(curl -s "https://${DOMAIN}/" 2>/dev/null)
    
    if [[ "$frontend_content" == *"Medgnosis"* ]]; then
        print_success "Frontend loads correctly"
    else
        print_error "Frontend does not load correctly"
        test_failures=$((test_failures + 1))
    fi
    
    # Check if login page is accessible
    print_status "Checking if login page is accessible..."
    local login_status=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/login" 2>/dev/null)
    
    if [[ "$login_status" =~ ^(200|301|302)$ ]]; then
        print_success "Login page is accessible (Status: $login_status)"
    else
        print_error "Login page is not accessible (Status: $login_status)"
        test_failures=$((test_failures + 1))
    fi
    
    # Check for JavaScript errors
    print_status "Checking for JavaScript errors..."
    if [ "$VERBOSE" = true ]; then
        print_verbose "This test requires manual verification in the browser console"
    fi
    
    # Check for broken images or resources
    print_status "Checking for broken resources..."
    local broken_resources=$(curl -s "https://${DOMAIN}/" 2>/dev/null | grep -o 'src="[^"]*"' | sed 's/src="//' | sed 's/"//' | grep -v "data:" | while read -r resource; do
        if [[ "$resource" =~ ^https?:// ]]; then
            curl -s -o /dev/null -w "%{http_code} %{url_effective}\n" "$resource" 2>/dev/null | grep -v "^200"
        elif [[ "$resource" =~ ^/ ]]; then
            curl -s -o /dev/null -w "%{http_code} %{url_effective}\n" "https://${DOMAIN}${resource}" 2>/dev/null | grep -v "^200"
        fi
    done)
    
    if [ -n "$broken_resources" ]; then
        print_warning "Found broken resources:"
        echo "$broken_resources"
    else
        print_success "No broken resources found"
    fi
    
    # Performance testing if enabled
    if [ "$TEST_PERFORMANCE" = true ]; then
        print_status "Testing frontend performance..."
        
        # Measure page load time
        local load_time=$(curl -s -w "%{time_total}\n" -o /dev/null "https://${DOMAIN}/" 2>/dev/null)
        
        print_status "Page load time: ${load_time} seconds"
        
        if (( $(echo "$load_time > 3" | bc -l) )); then
            print_warning "Page load time is slow (> 3 seconds)"
        else
            print_success "Page load time is acceptable (< 3 seconds)"
        fi
    fi
    
    # Summary
    if [ "$test_failures" -gt 0 ]; then
        print_error "Frontend tests completed with $test_failures failures"
        return 1
    else
        print_success "All frontend tests passed successfully"
        return 0
    fi
}

# Function to test backend
test_backend() {
    print_section "Testing Backend"
    
    local test_failures=0
    
    # Check if API endpoint is accessible
    print_status "Checking if API endpoint is accessible..."
    local api_status=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/api/test" 2>/dev/null)
    
    if [[ "$api_status" =~ ^(200|401|403|404)$ ]]; then
        print_success "API endpoint is accessible (Status: $api_status)"
    else
        print_error "API endpoint is not accessible (Status: $api_status)"
        test_failures=$((test_failures + 1))
    fi
    
    # Test API test endpoint
    print_status "Testing API test endpoint..."
    local test_response=$(curl -s "https://${DOMAIN}/api/test" 2>/dev/null)
    
    if [[ "$test_response" == *"API is working"* ]]; then
        print_success "API test endpoint returned expected response"
    else
        print_error "API test endpoint did not return expected response"
        test_failures=$((test_failures + 1))
        
        if [ "$VERBOSE" = true ]; then
            print_verbose "Response: $test_response"
        fi
    fi
    
    # Test API login endpoint
    print_status "Testing API login endpoint..."
    local login_response=$(curl -s -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com","password":"password"}' -o /dev/null -w "%{http_code}" "https://${DOMAIN}/api/auth/login" 2>/dev/null)
    
    if [[ "$login_response" =~ ^(200|401)$ ]]; then
        print_success "API login endpoint is working (Status: $login_response)"
    else
        print_error "API login endpoint returned unexpected status: $login_response"
        test_failures=$((test_failures + 1))
    fi
    
    # Test direct access to Laravel service
    print_status "Testing direct access to Laravel service..."
    local direct_response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8001/api/test" 2>/dev/null)
    
    if [[ "$direct_response" =~ ^(200|401|403|404)$ ]]; then
        print_success "Direct access to Laravel service is working (Status: $direct_response)"
    else
        print_error "Direct access to Laravel service returned unexpected status: $direct_response"
        test_failures=$((test_failures + 1))
    fi
    
    # Check database connection
    print_status "Checking database connection..."
    if [ -f "${DEPLOY_DIR}/backend/artisan" ]; then
        cd "${DEPLOY_DIR}/backend"
        if php artisan migrate:status &>/dev/null; then
            print_success "Database connection is working"
        else
            print_error "Database connection is not working"
            test_failures=$((test_failures + 1))
        fi
    else
        print_warning "Laravel artisan not found, skipping database connection check"
    fi
    
    # Performance testing if enabled
    if [ "$TEST_PERFORMANCE" = true ]; then
        print_status "Testing API performance..."
        
        # Measure API response time
        local api_time=$(curl -s -w "%{time_total}\n" -o /dev/null "https://${DOMAIN}/api/test" 2>/dev/null)
        
        print_status "API response time: ${api_time} seconds"
        
        if (( $(echo "$api_time > 1" | bc -l) )); then
            print_warning "API response time is slow (> 1 second)"
        else
            print_success "API response time is acceptable (< 1 second)"
        fi
    fi
    
    # Summary
    if [ "$test_failures" -gt 0 ]; then
        print_error "Backend tests completed with $test_failures failures"
        return 1
    else
        print_success "All backend tests passed successfully"
        return 0
    fi
}

# Function to test security
test_security() {
    print_section "Testing Security"
    
    local test_failures=0
    
    # Check SSL certificate
    print_status "Checking SSL certificate..."
    local ssl_info=$(curl -s -v "https://${DOMAIN}/" 2>&1 | grep -i "SSL connection\|certificate\|subject\|issuer\|expire")
    
    if [ -n "$ssl_info" ]; then
        print_success "SSL certificate is valid"
        
        if [ "$VERBOSE" = true ]; then
            print_verbose "SSL certificate info:"
            echo "$ssl_info"
        fi
    else
        print_error "SSL certificate validation failed"
        test_failures=$((test_failures + 1))
    fi
    
    # Check SSL certificate expiration
    print_status "Checking SSL certificate expiration..."
    local ssl_cert="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
    
    if [ -f "$ssl_cert" ]; then
        local expiry_date=$(openssl x509 -enddate -noout -in "$ssl_cert" | cut -d= -f2)
        local expiry_epoch=$(date -d "$expiry_date" +%s)
        local current_epoch=$(date +%s)
        local days_left=$(( (expiry_epoch - current_epoch) / 86400 ))
        
        print_status "SSL certificate expires in $days_left days"
        
        if [ "$days_left" -lt 30 ]; then
            print_warning "SSL certificate will expire soon (< 30 days)"
        else
            print_success "SSL certificate expiration is acceptable (> 30 days)"
        fi
    else
        print_warning "SSL certificate file not found, skipping expiration check"
    fi
    
    # Check security headers
    print_status "Checking security headers..."
    local security_headers=$(curl -s -I "https://${DOMAIN}/" 2>/dev/null | grep -i "X-Content-Type-Options\|X-Frame-Options\|X-XSS-Protection\|Content-Security-Policy\|Strict-Transport-Security")
    
    if [ -n "$security_headers" ]; then
        print_success "Security headers are present"
        
        if [ "$VERBOSE" = true ]; then
            print_verbose "Security headers:"
            echo "$security_headers"
        fi
    else
        print_warning "Security headers are missing or incomplete"
    fi
    
    # Check for HTTP to HTTPS redirection
    print_status "Checking HTTP to HTTPS redirection..."
    local redirect_status=$(curl -s -o /dev/null -w "%{http_code}" "http://${DOMAIN}/" 2>/dev/null)
    
    if [ "$redirect_status" -eq 301 ] || [ "$redirect_status" -eq 302 ]; then
        print_success "HTTP to HTTPS redirection is working"
    else
        print_error "HTTP to HTTPS redirection is not working"
        test_failures=$((test_failures + 1))
    fi
    
    # Check file permissions
    print_status "Checking file permissions..."
    
    # Check backend storage directory permissions
    if [ -d "${DEPLOY_DIR}/backend/storage" ]; then
        local storage_perms=$(stat -c "%a" "${DEPLOY_DIR}/backend/storage")
        
        if [ "$storage_perms" -eq 775 ] || [ "$storage_perms" -eq 777 ]; then
            print_success "Backend storage directory has correct permissions"
        else
            print_warning "Backend storage directory has incorrect permissions: $storage_perms (should be 775)"
        fi
    fi
    
    # Check .env file permissions
    if [ -f "${DEPLOY_DIR}/backend/.env" ]; then
        local env_perms=$(stat -c "%a" "${DEPLOY_DIR}/backend/.env")
        
        if [ "$env_perms" -le 644 ]; then
            print_success "Backend .env file has secure permissions"
        else
            print_warning "Backend .env file has insecure permissions: $env_perms (should be 644 or less)"
        fi
    fi
    
    # Summary
    if [ "$test_failures" -gt 0 ]; then
        print_error "Security tests completed with $test_failures failures"
        return 1
    else
        print_success "All security tests passed successfully"
        return 0
    fi
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
echo -e "${BOLD}Enhanced Test Script${RESET}"
echo "Version 1.0.0"
echo "Current time: $(date)"
echo "Domain: ${DOMAIN}"
echo ""

# Display interactive menu if in interactive mode
if [ "$INTERACTIVE" = true ]; then
    display_menu
fi

# Start testing
print_section "Starting Tests"
print_status "Test options:"
echo "  Frontend tests: $([ "$TEST_FRONTEND" = true ] && echo "Yes" || echo "No")"
echo "  Backend tests: $([ "$TEST_BACKEND" = true ] && echo "Yes" || echo "No")"
echo "  Service tests: $([ "$TEST_SERVICES" = true ] && echo "Yes" || echo "No")"
echo "  Security tests: $([ "$TEST_SECURITY" = true ] && echo "Yes" || echo "No")"
echo "  Performance tests: $([ "$TEST_PERFORMANCE" = true ] && echo "Yes" || echo "No")"
echo "  Verbose output: $([ "$VERBOSE" = true ] && echo "Yes" || echo "No")"
echo ""

# Initialize test results
test_results=()
test_failures=0

# Run service tests if selected
if [ "$TEST_SERVICES" = true ]; then
    if test_services; then
        test_results+=("Services: ${GREEN}PASSED${RESET}")
    else
        test_results+=("Services: ${RED}FAILED${RESET}")
        test_failures=$((test_failures + 1))
    fi
fi

# Run frontend tests if selected
if [ "$TEST_FRONTEND" = true ]; then
    if test_frontend; then
        test_results+=("Frontend: ${GREEN}PASSED${RESET}")
    else
        test_results+=("Frontend: ${RED}FAILED${RESET}")
        test_failures=$((test_failures + 1))
    fi
fi

# Run backend tests if selected
if [ "$TEST_BACKEND" = true ]; then
    if test_backend; then
        test_results+=("Backend: ${GREEN}PASSED${RESET}")
    else
        test_results+=("Backend: ${RED}FAILED${RESET}")
        test_failures=$((test_failures + 1))
    fi
fi

# Run security tests if selected
if [ "$TEST_SECURITY" = true ]; then
    if test_security; then
        test_results+=("Security: ${GREEN}PASSED${RESET}")
    else
        test_results+=("Security: ${RED}FAILED${RESET}")
        test_failures=$((test_failures + 1))
    fi
fi

# Test summary
print_section "Test Summary"
echo "Tests completed at: $(date)"
echo "Domain: ${DOMAIN}"
echo ""

for result in "${test_results[@]}"; do
    echo -e "$result"
done

echo ""
if [ "$test_failures" -eq 0 ]; then
    print_success "All tests passed successfully!"
else
    print_error "Tests completed with $test_failures failures"
    echo "Please check the logs for more information: ${LOG_FILE}"
fi

exit $test_failures
