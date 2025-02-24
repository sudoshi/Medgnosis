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
rsync: [receiver] mkstemp "/var/www/Medgnosis/backend/vendor/laravel/framework/src/Illuminate/Contracts/Container/.CircularDependencyException.php.7SOQJM" failed: Permission denied (13)
```

or

```
rsync: [generator] failed to set times on "/var/www/Medgnosis/backend/vendor/psy/psysh/src/Command": Operation not permitted (1)
```

These indicate permission problems with the vendor directory. To solve this, the workflow now uses a completely different deployment strategy:

1. **Skip the vendor directory during deployment**:
   ```yaml
   - name: Deploy backend
     uses: burnett01/rsync-deployments@5.2.1
     with:
       switches: -avzr --delete --exclude=".env" --exclude="vendor/" --verbose
       path: backend/
       remote_path: /var/www/Medgnosis/backend
   ```

2. **Use a deployment script to install dependencies on the server**:
   ```bash
   # deployment.sh
   cd /var/www/Medgnosis/backend
   composer install --no-dev --optimize-autoloader
   
   # Generate key if needed
   if ! grep -q "APP_KEY=" .env || grep -q "APP_KEY=$" .env; then
     php artisan key:generate
   fi
   
   # Clear caches
   php artisan config:clear
   php artisan route:clear
   php artisan view:clear
   ```

3. **Avoid using sudo commands entirely**:
   - No service restarts (must be done manually by an administrator)
   - No permission changes (directories must be pre-configured with correct permissions)
   - No system-level operations

This approach completely avoids vendor directory permission issues by:
- Skipping the problematic vendor directory during rsync
- Installing dependencies directly on the server
- Using a deployment script that runs with the SSH user's permissions

### Server Setup Requirements

For this deployment strategy to work, the server must be set up with the following permissions:

1. The SSH user must have write access to `/var/www/Medgnosis/backend` and `/var/www/Medgnosis/frontend`
2. The SSH user must have permission to run `composer install` in the backend directory
3. The directories must be pre-configured with the correct permissions for the web server

You can set this up by having an administrator run these commands once:

```bash
# Set up permissions for deployment
sudo chown -R ssh-user:www-data /var/www/Medgnosis
sudo chmod -R 775 /var/www/Medgnosis

# Ensure composer is available to the SSH user
sudo apt-get install composer
```

Where `ssh-user` is the username used for SSH deployment.

### Manual Deployment Without Sudo

If you need to manually deploy without sudo privileges:

```bash
# 1. Backup .env file if it exists
mkdir -p ~/medgnosis-backup
cp /var/www/Medgnosis/backend/.env ~/medgnosis-backup/.env 2>/dev/null || true

# 2. Deploy directly to target directories (excluding vendor)
rsync -avzr --delete --exclude=".env" --exclude="vendor/" backend/ user@server:/var/www/Medgnosis/backend
rsync -avzr --delete frontend/.next/standalone/ user@server:/var/www/Medgnosis/frontend

# 3. Install dependencies on the server
ssh user@server "cd /var/www/Medgnosis/backend && composer install --no-dev --optimize-autoloader"

# 4. Restore .env file
cp ~/medgnosis-backup/.env /var/www/Medgnosis/backend/.env 2>/dev/null || true

# 5. Clear Laravel caches
ssh user@server "cd /var/www/Medgnosis/backend && php artisan config:clear && php artisan route:clear && php artisan view:clear"

# 6. Clean up
rm -rf ~/medgnosis-backup
```

Note: After deployment, you'll need to ask a server administrator to restart the necessary services:
- php8.2-fpm
- apache2
- nextjs

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
