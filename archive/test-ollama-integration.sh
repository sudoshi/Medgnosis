#!/bin/bash

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

# Test direct Ollama API
print_status "Testing direct Ollama API..."
direct_response=$(curl -s -X POST http://localhost:11434/api/generate -d '{"model": "gemma:latest", "prompt": "Hello", "stream": false}')

if [[ $direct_response == *"response"* ]]; then
    print_status "Direct Ollama API is working correctly"
    echo "Response: $direct_response"
else
    print_error "Direct Ollama API test failed"
fi

# Test Apache proxy to Ollama API
print_status "Testing Apache proxy to Ollama API..."
proxy_response=$(curl -s -k -X POST https://demo.medgnosis.app/ollama/api/generate -d '{"model": "gemma:latest", "prompt": "Hello", "stream": false}')

if [[ $proxy_response == *"response"* ]]; then
    print_status "Apache proxy to Ollama API is working correctly"
    echo "Response: $proxy_response"
else
    print_error "Apache proxy to Ollama API test failed"
fi

# Check if Ollama service is running
print_status "Checking Ollama service status..."
if systemctl is-active --quiet ollama; then
    print_status "Ollama service is running"
else
    print_error "Ollama service is not running"
fi

# Check Apache logs for any errors
print_status "Checking Apache error logs for Ollama-related errors..."
apache_errors=$(sudo grep -i "ollama\|proxy" /var/log/apache2/error.log | tail -n 20)

if [[ -z "$apache_errors" ]]; then
    print_status "No Ollama-related errors found in Apache logs"
else
    print_warning "Found potential Ollama-related errors in Apache logs:"
    echo "$apache_errors"
fi

print_status "All tests completed!"
print_status "If all tests passed, your Ollama integration is working correctly."
print_status "You can now use the Abby chat interface at https://demo.medgnosis.app"
