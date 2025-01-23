<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;

class AuthController extends Controller
{
    /**
     * Handle user login with improved error handling and logging
     */
    public function login(Request $request)
    {
        try {
            $request->validate([
                'email' => 'required|email',
                'password' => 'required'
            ]);

            // Check if user exists first
            $user = User::where('email', $request->email)->first();
            if (!$user) {
                Log::warning('Login attempt with non-existent email', [
                    'email' => $request->email,
                    'ip' => $request->ip()
                ]);
                return response()->json([
                    'message' => 'No account found with this email address.',
                    'error' => 'invalid_credentials'
                ], 401);
            }

            // Verify database connection
            if (!DB::connection()->getDatabaseName()) {
                Log::error('Database connection failed during login attempt');
                return response()->json([
                    'message' => 'Service temporarily unavailable. Please try again later.',
                    'error' => 'database_error'
                ], 503);
            }

            if (!Auth::attempt($request->only('email', 'password'))) {
                Log::warning('Failed login attempt', [
                    'email' => $request->email,
                    'ip' => $request->ip()
                ]);
                return response()->json([
                    'message' => 'The provided credentials are incorrect.',
                    'error' => 'invalid_credentials'
                ], 401);
            }

            Log::info('User logged in successfully', [
                'user_id' => Auth::id(),
                'email' => $request->email
            ]);

            return response()->json([
                'user' => $request->user()
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            Log::error('Unexpected error during login', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'email' => $request->email ?? 'not provided'
            ]);
            return response()->json([
                'message' => 'An unexpected error occurred. Please try again later.',
                'error' => 'server_error'
            ], 500);
        }
    }

    /**
     * Get authenticated user with error handling
     */
    public function user(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) {
                Log::warning('User fetch attempt without valid session');
                return response()->json([
                    'message' => 'Not authenticated',
                    'error' => 'no_session'
                ], 401);
            }
            return response()->json($user);
        } catch (\Exception $e) {
            Log::error('Error fetching user data', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'user_id' => $request->user()?->id
            ]);
            return response()->json([
                'message' => 'Error fetching user data',
                'error' => 'server_error'
            ], 500);
        }
    }

    /**
     * Handle user logout with error handling
     */
    public function logout(Request $request)
    {
        try {
            $userId = Auth::id(); // Get ID before logout

            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            Log::info('User logged out successfully', [
                'user_id' => $userId
            ]);

            return response()->json(['message' => 'Logged out successfully']);
        } catch (\Exception $e) {
            Log::error('Error during logout', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'user_id' => Auth::id()
            ]);
            return response()->json([
                'message' => 'Error during logout',
                'error' => 'server_error'
            ], 500);
        }
    }
}
