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

This indicates that the SSH user doesn't have write permissions to the target directories. The workflow includes a step to set the correct permissions before deployment, but if you're still encountering issues:

1. Ensure the SSH user has sudo privileges on the target server
2. Verify that the "Prepare target directories" step is running successfully
3. Check that the post-deployment tasks are correctly resetting permissions to www-data

If you need to manually fix permissions:

```bash
# On the target server
sudo chown -R your-ssh-user:your-ssh-user /var/www/Medgnosis
# After deployment
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
