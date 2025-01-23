<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie', 'login', 'logout', 'user'],
    'allowed_methods' => ['*'],
    'allowed_origins' => ['https://*.acumenus.net', 'http://*.acumenus.net', 'http://localhost:3000'],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['X-XSRF-TOKEN', 'X-CSRF-TOKEN', 'Content-Type', 'X-Requested-With', 'Accept', 'Origin', 'Authorization'],
    'exposed_headers' => ['Set-Cookie', 'X-XSRF-TOKEN'],
    'max_age' => 7200,
    'supports_credentials' => true,
];
