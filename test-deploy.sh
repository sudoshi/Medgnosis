#!/bin/bash

# This is a test script to verify the fix for the deploy.sh script
# It focuses on the frontend build process which was failing

echo "Starting test deployment..."

# Create a temporary directory for testing
TEST_DIR="/tmp/medgnosis-test-deploy"
echo "Creating test directory at $TEST_DIR"
mkdir -p $TEST_DIR

# Copy frontend files to test directory
echo "Copying frontend files to test directory..."
rsync -av --exclude 'node_modules' --exclude '.next' frontend/ $TEST_DIR/

# Change to test directory
cd $TEST_DIR

echo "Installing frontend dependencies with npm ci..."
npm ci

echo "Building frontend..."
NEXT_TELEMETRY_DISABLED=1 npm run build

# Check build status
if [ $? -eq 0 ]; then
    echo "✅ Build successful! The fix worked."
else
    echo "❌ Build failed. The fix did not resolve all issues."
    echo "Check the error messages above for more details."
fi

echo "Test deployment completed."
echo "You can inspect the test build at $TEST_DIR"
