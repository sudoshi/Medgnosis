<?php

// Simple script to test if the APP_KEY is being read correctly
echo "Testing Laravel Environment Variables<br>";
echo "APP_KEY: " . getenv('APP_KEY') . "<br>";
echo "APP_ENV: " . getenv('APP_ENV') . "<br>";

// Try to read from .env file directly
$envFile = __DIR__ . '/../.env';
echo "Reading from .env file at: " . $envFile . "<br>";

if (file_exists($envFile)) {
    $envContents = file_get_contents($envFile);
    echo "ENV File Contents:<br><pre>" . htmlspecialchars($envContents) . "</pre>";
} else {
    echo "ENV file not found!<br>";
}
