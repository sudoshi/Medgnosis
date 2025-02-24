#!/bin/bash
set -e

echo "=== Testing CI/CD fixes ==="
echo "1. Installing frontend dependencies..."
cd frontend
npm ci

echo "2. Installing autoprefixer, postcss, and tailwindcss..."
npm install autoprefixer postcss tailwindcss

echo "3. Building frontend..."
npm run build

echo "=== CI/CD test completed successfully! ==="
