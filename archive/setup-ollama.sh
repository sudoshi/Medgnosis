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

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root (sudo)"
fi

print_status "Setting up Ollama service..."

# Check if Ollama is already installed
if command -v ollama &> /dev/null; then
    print_status "Ollama is already installed"
else
    print_status "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    
    if [ $? -ne 0 ]; then
        print_error "Failed to install Ollama"
    fi
fi

# Copy the service file
print_status "Setting up Ollama systemd service..."
cp "$(dirname "$0")/apache-config/ollama.service" /etc/systemd/system/
chmod 644 /etc/systemd/system/ollama.service

# Reload systemd
systemctl daemon-reload

# Enable and start the service
print_status "Enabling and starting Ollama service..."
systemctl enable ollama
systemctl start ollama

# Check if service is running
if systemctl is-active --quiet ollama; then
    print_status "Ollama service is running"
else
    print_error "Failed to start Ollama service"
fi

# Pull the Gemma model
print_status "Pulling the Gemma model (this may take a while)..."
ollama pull gemma:latest

if [ $? -ne 0 ]; then
    print_error "Failed to pull Gemma model"
fi

print_status "Testing Ollama API..."
response=$(curl -s -X POST http://localhost:11434/api/generate -d '{"model": "gemma:latest", "prompt": "Hello", "stream": false}')

if [[ $response == *"response"* ]]; then
    print_status "Ollama API is working correctly"
else
    print_error "Ollama API test failed"
fi

print_status "Ollama setup complete!"
print_status "Now you can run the local-deploy.sh script to deploy the application with Ollama integration."
