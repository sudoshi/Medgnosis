# Apache Configuration for Ollama Integration

This directory contains the Apache configuration files needed to proxy requests from your Apache web server to the Ollama API service.

## Setup Instructions

1. Make sure the Ollama service is running on the server:
   ```bash
   # Check if Ollama is running
   systemctl status ollama
   
   # Start Ollama if it's not running
   systemctl start ollama
   ```

2. Include the Ollama proxy configuration in your Apache virtual host:
   ```apache
   # In your VirtualHost configuration (usually in /etc/apache2/sites-available/demo.medgnosis.app.conf)
   <VirtualHost *:80>
       ServerName demo.medgnosis.app
       
       # Other configuration...
       
       # Include the Ollama proxy configuration
       Include /path/to/Medgnosis/apache-config/ollama-proxy.conf
       
       # Rest of your configuration...
   </VirtualHost>
   ```

3. Enable the required Apache modules:
   ```bash
   sudo a2enmod proxy
   sudo a2enmod proxy_http
   sudo a2enmod headers
   ```

4. Test the configuration:
   ```bash
   sudo apache2ctl configtest
   ```

5. Restart Apache:
   ```bash
   sudo systemctl restart apache2
   ```

## Testing the Proxy

You can test if the proxy is working correctly by making a request to the Ollama API through the proxy:

```bash
curl -X POST http://demo.medgnosis.app/ollama/api/generate -d '{"model": "gemma:latest", "prompt": "Hello", "stream": false}'
```

If everything is set up correctly, you should receive a response from the Ollama API.

## Troubleshooting

If you encounter issues with the proxy:

1. Check the Apache error logs:
   ```bash
   sudo tail -f /var/log/apache2/error.log
   ```

2. Verify that Ollama is running and accessible locally:
   ```bash
   curl -X POST http://localhost:11434/api/generate -d '{"model": "gemma:latest", "prompt": "Hello", "stream": false}'
   ```

3. Ensure the proxy modules are enabled in Apache:
   ```bash
   apache2ctl -M | grep proxy
   ```

4. Check for firewall rules that might be blocking the connection:
   ```bash
   sudo ufw status
   ```
