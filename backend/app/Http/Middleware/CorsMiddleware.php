<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class CorsMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);

        if (!$response) {
            $response = response('', 204);
        }

        // Get the origin from the request
        $origin = $request->header('Origin');
        
        // Allow both with and without trailing period
        if ($origin === 'https://demo.medgnosis.app' || $origin === 'https://demo.medgnosis.app.') {
            $response->headers->set('Access-Control-Allow-Origin', $origin);
        } else {
            $response->headers->set('Access-Control-Allow-Origin', 'https://demo.medgnosis.app');
        }
        $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-XSRF-TOKEN');
        $response->headers->set('Access-Control-Allow-Credentials', 'true');
        $response->headers->set('Access-Control-Max-Age', '86400');

        if ($request->isMethod('OPTIONS')) {
            return response()->json('', 200);
        }

        return $response;
    }
}
