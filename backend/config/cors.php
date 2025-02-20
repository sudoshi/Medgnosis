<?php

return [
    'paths' => ['*'],
    'allowed_methods' => ['*'],
    'allowed_origins' => ['http://localhost:3000', 'http://localhost:8000', 'https://demo.medgnosis.app'],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
