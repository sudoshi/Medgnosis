#!/bin/bash

# Test script for Medgnosis local deployment
# This script tests the Medgnosis application deployment

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
}

# Function to print warning messages
print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_status "Testing Medgnosis deployment..."

# Check if Apache is running
if systemctl is-active --quiet apache2; then
    print_status "Apache is running"
else
    print_error "Apache is not running"
fi

# Check if Next.js service is running
if systemctl is-active --quiet nextjs; then
    print_status "Next.js service is running"
else
    print_error "Next.js service is not running"
fi

# Check if Laravel service is running
if systemctl is-active --quiet laravel; then
    print_status "Laravel service is running"
else
    print_error "Laravel service is not running"
fi

# Check if domain is accessible
if curl -s -o /dev/null -w "%{http_code}" https://demo.medgnosis.app/ | grep -q "200\|301\|302"; then
    print_status "Domain is accessible"
else
    print_error "Domain is not accessible"
fi

# Check if API endpoint is accessible
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://demo.medgnosis.app/api/test)
if [[ $API_STATUS == "200" ]]; then
    print_status "API endpoint is accessible"
else
    print_error "API endpoint is not accessible (Status: $API_STATUS)"
fi

# Check Laravel logs for errors
if grep -q "error\|exception" /var/www/Medgnosis/backend/storage/logs/laravel.log 2>/dev/null; then
    print_warning "Found errors in Laravel logs. Please check /var/www/Medgnosis/backend/storage/logs/laravel.log"
fi

# Check Apache logs for errors
if grep -q "error\|exception" /var/log/apache2/error.log 2>/dev/null; then
    print_warning "Found errors in Apache logs. Please check /var/log/apache2/error.log"
fi

# Test API endpoints
print_status "Testing API endpoint..."

# Test API test endpoint
TEST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" https://demo.medgnosis.app/api/test)
if [[ $TEST_RESPONSE == "200" ]]; then
    print_status "API test endpoint returned 200 OK"
else
    print_error "API test endpoint returned $TEST_RESPONSE"
fi

# Test API login endpoint
LOGIN_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com","password":"password"}' -o /dev/null -w "%{http_code}" https://demo.medgnosis.app/api/auth/login)
if [[ $LOGIN_RESPONSE == "200" || $LOGIN_RESPONSE == "401" ]]; then
    print_status "API login endpoint is working (Status: $LOGIN_RESPONSE)"
else
    print_error "API login endpoint returned $LOGIN_RESPONSE"
    print_error "The route may not be defined or the API is not properly configured"
fi

# Test direct access to Laravel service
DIRECT_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/api/test)
if [[ $DIRECT_RESPONSE == "200" ]]; then
    print_status "Direct access to Laravel service is working"
else
    print_error "Direct access to Laravel service returned $DIRECT_RESPONSE"
fi

print_status "Deployment test completed"
