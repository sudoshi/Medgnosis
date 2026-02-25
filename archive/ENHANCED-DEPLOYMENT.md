# Enhanced Deployment Script for Medgnosis

This document provides comprehensive information about the `enhanced-deploy.sh` script, which offers a fast and flawless way to update your local Apache2 application deployment for Medgnosis.

## Features

- **Interactive Mode**: User-friendly menu system for selecting deployment options
- **Selective Deployment**: Deploy only the frontend, only the backend, or both
- **Incremental Updates**: Smart detection of changes to minimize deployment time
- **Dependency Management**: Skip dependency installation when no changes are detected
- **Backup and Rollback**: Automatic backup creation and easy rollback functionality
- **Comprehensive Testing**: Thorough post-deployment tests to ensure everything works
- **Intelligent Service Management**: Only restart services when necessary
- **Verbose Logging**: Detailed logs for troubleshooting
- **Command-line Options**: Support for non-interactive usage with command-line arguments

## Requirements

- Ubuntu server with Apache installed
- Node.js 18+ and npm
- PHP 8.1+ and Composer
- PostgreSQL database
- SSL certificate for the domain (Let's Encrypt recommended)

## Usage

### Interactive Mode

Simply run the script without arguments to enter interactive mode:

```bash
sudo ./enhanced-deploy.sh
```

This will display a menu with the following options:

1. Deploy frontend only
2. Deploy backend only
3. Deploy both frontend and backend
4. List available backups
5. Restore from backup
6. Run tests only
7. Exit

After selecting a deployment option, you'll be prompted for additional options:

- Enable quick mode (Skip dependency installation if no changes detected)
- Enable verbose output
- Skip post-deployment tests
- Skip backup creation
- Force dependency installation

### Command-line Mode

For automated deployments or scripting, you can use command-line arguments:

```bash
sudo ./enhanced-deploy.sh --frontend-only --quick --verbose
```

#### Available Options

- `--frontend-only`: Deploy only the frontend
- `--backend-only`: Deploy only the backend
- `--full`: Deploy both frontend and backend (default)
- `--quick`: Skip dependency installation if no changes detected
- `--verbose`: Show detailed output
- `--skip-tests`: Skip post-deployment tests
- `--no-backup`: Skip backup creation
- `--force-dependencies`: Force dependency installation even if no changes detected
- `--non-interactive`: Run in non-interactive mode
- `--restore=ID`: Restore from backup with the specified ID (or 'latest')
- `--list-backups`: List available backups
- `--help`: Show help message

### Examples

```bash
# Interactive mode
sudo ./enhanced-deploy.sh

# Deploy only frontend with quick mode
sudo ./enhanced-deploy.sh --frontend-only --quick

# Deploy only backend with verbose output
sudo ./enhanced-deploy.sh --backend-only --verbose

# Deploy both without backup or tests
sudo ./enhanced-deploy.sh --full --no-backup --skip-tests

# Restore from the latest backup
sudo ./enhanced-deploy.sh --restore=latest

# List available backups
sudo ./enhanced-deploy.sh --list-backups
```

## Backup and Rollback

The script automatically creates backups before deployment (unless disabled with `--no-backup`). Backups are stored in `/var/www/Medgnosis-backups` with timestamps as identifiers.

To list available backups:

```bash
sudo ./enhanced-deploy.sh --list-backups
```

To restore from a backup:

```bash
sudo ./enhanced-deploy.sh --restore=20250224-123456
```

Or to restore the latest backup:

```bash
sudo ./enhanced-deploy.sh --restore=latest
```

## Logging

Detailed logs are stored in `/var/log/medgnosis-deploy/` with timestamps. These logs include all operations performed during deployment and can be useful for troubleshooting.

## Configuration

The script uses the following default configuration:

- Domain: `demo.medgnosis.app`
- Deployment Directory: `/var/www/Medgnosis`
- Apache Configuration: `/etc/apache2/sites-available/demo-medgnosis.conf`
- Next.js Service: `/etc/systemd/system/nextjs.service`
- Laravel Service: `/etc/systemd/system/laravel.service`
- Backup Directory: `/var/www/Medgnosis-backups`
- Log Directory: `/var/log/medgnosis-deploy`

If you need to modify these defaults, edit the configuration section at the top of the script.

## How It Works

### Deployment Process

1. **Pre-deployment Checks**: Verify system requirements and dependencies
2. **Backup Creation**: Create a timestamped backup of the current deployment
3. **Frontend Deployment**: Copy frontend files, set up environment, install dependencies, and build
4. **Backend Deployment**: Copy backend files, set up environment, install dependencies, and clear caches
5. **Service Configuration**: Configure Apache and systemd services
6. **Service Management**: Restart services as needed
7. **Post-deployment Tests**: Verify that everything is working correctly
8. **Deployment Summary**: Display a summary of the deployment

### Smart Dependency Management

The script tracks changes to `package.json`, `package-lock.json`, `composer.json`, and `composer.lock` files. If no changes are detected and quick mode is enabled, dependency installation is skipped to save time.

### Incremental Updates

The script uses `rsync` with appropriate flags to efficiently transfer only changed files, minimizing deployment time.

## Troubleshooting

### Common Issues

1. **Permission Errors**: Ensure you're running the script with `sudo`
2. **Service Failures**: Check service logs with `journalctl -u nextjs` or `journalctl -u laravel`
3. **Apache Configuration Errors**: Verify Apache configuration with `apache2ctl configtest`
4. **SSL Certificate Issues**: Ensure SSL certificates exist and are valid

### Logs

Check the deployment logs in `/var/log/medgnosis-deploy/` for detailed information about any failures.

### Rollback

If deployment fails, you can always roll back to the previous state:

```bash
sudo ./enhanced-deploy.sh --restore=latest
```

## Comparison with Original Deployment Script

The enhanced deployment script offers several improvements over the original `local-deploy.sh`:

1. **Selective Deployment**: Deploy only what you need
2. **Incremental Updates**: Faster deployments by only updating changed files
3. **Smart Dependency Management**: Skip unnecessary dependency installations
4. **Backup and Rollback**: Easy recovery from failed deployments
5. **Intelligent Service Management**: Minimize service disruptions
6. **Comprehensive Testing**: Better verification of deployment success
7. **Verbose Logging**: Improved troubleshooting capabilities
8. **Interactive and Command-line Modes**: More flexible usage options

## Security Considerations

- The script requires root privileges to modify system files and restart services
- Database credentials are stored in environment files
- SSL certificates are used for HTTPS
- File permissions are set appropriately for web server access

## Contributing

If you find issues or have suggestions for improvements, please submit them to the project repository.

## License

This script is provided as part of the Medgnosis project and is subject to the same licensing terms.
