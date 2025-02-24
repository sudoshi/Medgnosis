# Deployment Guide for Medgnosis

This guide provides instructions for deploying the Medgnosis application using GitHub Actions.

## GitHub Actions Workflow

The deployment process is automated using GitHub Actions. The workflow is defined in `.github/workflows/deploy.yml` and includes the following steps:

1. Build the frontend (Next.js)
2. Set up the backend (Laravel)
3. Deploy both to the production server using rsync
4. Run post-deployment tasks

## Troubleshooting Deployment Issues

### SSH Connection Issues

If you encounter the following error in your GitHub Actions logs:

```
ssh: Could not resolve hostname ***: Name does not resolve
rsync: connection unexpectedly closed (0 bytes received so far) [sender]
rsync error: unexplained error (code 255) at io.c(228) [sender=3.2.4]
```

This indicates that GitHub Actions cannot resolve the hostname specified in your `SSH_HOST` secret.

#### Solution:

1. **Use an IP address instead of a hostname**:
   - Go to your GitHub repository
   - Navigate to Settings > Secrets and variables > Actions
   - Edit the `SSH_HOST` secret
   - Replace the hostname with the server's IP address

2. **Verify SSH connectivity**:
   - The workflow includes a test SSH connection step that will help diagnose connection issues
   - Check the logs of this step for more detailed error messages

### Other Common Issues

#### Missing Build Artifacts

If the deployment fails because build artifacts are missing, check:

1. The frontend build step for any errors
2. Ensure the paths in the rsync deployment steps match the actual build output locations

#### Permission Issues

If you encounter permission errors like these during deployment:

```
rsync: [receiver] mkstemp "/var/www/Medgnosis/backend/vendor/psr/clock/.CHANGELOG.md.vpHKHW" failed: Permission denied (13)
```

or

```
rsync: [generator] failed to set times on "/var/www/Medgnosis/backend/vendor/laravel/framework/src/Illuminate/Container": Operation not permitted (1)
```

These indicate permission problems with the target directories. To solve this, the workflow now uses a completely different deployment strategy:

1. **Deploy to temporary directories first**:
   ```bash
   # Create clean temporary directories
   rm -rf /tmp/medgnosis-deploy
   mkdir -p /tmp/medgnosis-deploy/backend
   mkdir -p /tmp/medgnosis-deploy/frontend
   ```

2. **Rsync files to these temporary directories** where the SSH user has full permissions

3. **After successful rsync, replace the production directories**:
   ```bash
   # Remove existing directories
   sudo rm -rf /var/www/Medgnosis/backend
   sudo rm -rf /var/www/Medgnosis/frontend
   
   # Create fresh directories
   sudo mkdir -p /var/www/Medgnosis/backend
   sudo mkdir -p /var/www/Medgnosis/frontend
   
   # Copy files from temp to destination
   sudo cp -a /tmp/medgnosis-deploy/backend/. /var/www/Medgnosis/backend/
   sudo cp -a /tmp/medgnosis-deploy/frontend/. /var/www/Medgnosis/frontend/
   ```

4. **Set proper permissions after deployment**:
   ```bash
   sudo chown -R www-data:www-data /var/www/Medgnosis
   sudo chmod -R 755 /var/www/Medgnosis
   sudo chmod -R 775 /var/www/Medgnosis/backend/storage
   sudo chmod -R 775 /var/www/Medgnosis/backend/bootstrap/cache
   ```

This approach completely avoids permission issues by:
- Using temporary directories where the SSH user has full control
- Removing the problematic directories entirely
- Using `sudo` to copy files into place with the correct permissions from the start

If you need to manually deploy using this approach:

```bash
# On the target server
# 1. Create temporary directories
rm -rf /tmp/medgnosis-deploy
mkdir -p /tmp/medgnosis-deploy/backend
mkdir -p /tmp/medgnosis-deploy/frontend

# 2. Backup .env file if it exists
sudo cp /var/www/Medgnosis/backend/.env /tmp/medgnosis-env-backup 2>/dev/null || true

# 3. Deploy to temporary directories
rsync -avzr --delete --exclude=".env" backend/ user@server:/tmp/medgnosis-deploy/backend
rsync -avzr --delete frontend/.next/standalone/ user@server:/tmp/medgnosis-deploy/frontend

# 4. Replace production directories
sudo rm -rf /var/www/Medgnosis/backend
sudo rm -rf /var/www/Medgnosis/frontend
sudo mkdir -p /var/www/Medgnosis/backend
sudo mkdir -p /var/www/Medgnosis/frontend
sudo cp -a /tmp/medgnosis-deploy/backend/. /var/www/Medgnosis/backend/
sudo cp -a /tmp/medgnosis-deploy/frontend/. /var/www/Medgnosis/frontend/

# 5. Restore .env file
sudo cp /tmp/medgnosis-env-backup /var/www/Medgnosis/backend/.env 2>/dev/null || true

# 6. Set proper permissions
sudo chown -R www-data:www-data /var/www/Medgnosis
sudo chmod -R 755 /var/www/Medgnosis
sudo chmod -R 775 /var/www/Medgnosis/backend/storage
sudo chmod -R 775 /var/www/Medgnosis/backend/bootstrap/cache
```

## Updating GitHub Secrets

To update the GitHub secrets used for deployment:

1. Go to your GitHub repository
2. Navigate to Settings > Secrets and variables > Actions
3. Edit or add the following secrets:
   - `SSH_HOST`: The hostname or IP address of your server
   - `SSH_USER`: The SSH username for connecting to the server
   - `SSH_PRIVATE_KEY`: The private SSH key for authentication
   - `DB_PASSWORD`: (Optional) The database password for production

## Manual Deployment

If you need to deploy manually:

1. Build the frontend:
   ```bash
   cd frontend
   npm ci
   npm run build
   ```

2. Set up the backend:
   ```bash
   cd backend
   composer install --no-dev --optimize-autoloader
   php artisan config:cache
   php artisan route:cache
   php artisan view:cache
   ```

3. Deploy to the server:
   ```bash
   rsync -avzr --delete --exclude=".env" backend/ user@server:/var/www/Medgnosis/backend
   rsync -avzr --delete frontend/.next/standalone/ user@server:/var/www/Medgnosis/frontend
   ```
