<?php

return [
    'paths' => ['*'],
    'allowed_methods' => ['*'],
    'allowed_origins' => ['https://*.acumenus.net', 'http://*.acumenus.net', 'http://localhost:3000'],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['X-XSRF-TOKEN', 'Content-Type', 'X-Requested-With', 'Accept', 'Origin', 'Authorization'],
    'exposed_headers' => ['Set-Cookie'],
    'max_age' => 7200,
    'supports_credentials' => true,
];
