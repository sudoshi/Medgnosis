# Ollama Integration with Abby Chat

This document describes how to set up and use the Ollama integration with the Abby chat interface in Medgnosis.

## Overview

Medgnosis integrates with [Ollama](https://ollama.com/), an open-source platform for running large language models locally. This integration allows the Abby chat interface to use the Gemma model for generating responses to user queries.

## Setup Instructions

### 1. Install and Configure Ollama

Run the setup script to install Ollama and configure it as a system service:

```bash
sudo ./setup-ollama.sh
```

This script will:
- Install Ollama if it's not already installed
- Set up Ollama as a systemd service
- Pull the Gemma model
- Test the Ollama API

### 2. Deploy the Application

Deploy the application with the Ollama integration:

```bash
sudo ./local-deploy.sh
```

This will:
- Build the Next.js frontend
- Configure Apache to proxy requests to Ollama
- Set up the necessary services

### 3. Test the Integration

After deployment, you can test the Ollama integration:

```bash
./test-ollama-integration.sh
```

This script will:
- Test the direct Ollama API
- Test the Apache proxy to the Ollama API
- Check the Ollama service status
- Check Apache logs for any errors

## Usage

### Abby Chat Interface

The Abby chat interface is available in the application. To use it:

1. Click on the Abby icon in the application
2. Type your message in the chat input
3. Press Enter or click the Send button
4. Abby will respond using the Ollama Gemma model

### Ollama Test Page

For testing purposes, there's also a dedicated Ollama test page:

```
https://demo.medgnosis.app/ollama-test
```

This page provides a simple chat interface that directly interacts with the Ollama API.

## Troubleshooting

### Ollama Service Issues

If the Ollama service is not running:

```bash
sudo systemctl status ollama
```

To restart the service:

```bash
sudo systemctl restart ollama
```

### Apache Proxy Issues

Check the Apache error logs:

```bash
sudo tail -f /var/log/apache2/error.log
```

Verify that the proxy configuration is correct:

```bash
sudo apache2ctl -t
```

### Model Issues

If you need to update or reinstall the Gemma model:

```bash
ollama pull gemma:latest
```

## Technical Details

### API Endpoints

The Ollama API is accessible at:

- Development: `http://localhost:11434/api/generate`
- Production: `https://demo.medgnosis.app/ollama/api/generate`

### Request Format

```json
{
  "model": "gemma:latest",
  "prompt": "Your message here",
  "stream": true
}
```

### Response Format

The API returns a stream of JSON objects, each containing a fragment of the response:

```json
{"model":"gemma:latest","created_at":"2025-02-25T21:46:46.344150744Z","response":"Hello!","done":false}
{"model":"gemma:latest","created_at":"2025-02-25T21:46:46.344150744Z","response":" 👋","done":false}
{"model":"gemma:latest","created_at":"2025-02-25T21:46:46.344150744Z","response":" I'm","done":false}
...
{"model":"gemma:latest","created_at":"2025-02-25T21:46:46.344150744Z","response":"?","done":true}
```

## References

- [Ollama Documentation](https://ollama.com/docs)
- [Gemma Model Information](https://ollama.com/library/gemma)
- [Apache Proxy Documentation](https://httpd.apache.org/docs/2.4/mod/mod_proxy.html)
