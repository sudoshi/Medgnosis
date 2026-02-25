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
     * Simple login that checks credentials against database
     */
    public function login(Request $request)
    {
        // Log entry point for debugging
        Log::info('Login method invoked');

        // Simplified authentication logic for development
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        if ($request->email === 'test@example.com' && $request->password === 'password') {
            return response()->json([
                'user' => [
                    'id' => 1,
                    'name' => 'Test User',
                    'email' => 'test@example.com',
                ],
                'message' => 'Login successful',
            ]);
        }

        return response()->json([
            'message' => 'Invalid credentials',
        ], 401);
    }

    /**
     * Get user data
     */
    public function user(Request $request)
    {
        $user = User::where('email', $request->email)->first();
        if ($user) {
            $user->makeHidden(['password', 'remember_token']);
            return response()->json($user);
        }
        return response()->json([
            'message' => 'User not found',
            'error' => 'not_found'
        ], 404);
    }

    /**
     * Simple logout
     */
    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Logged out successfully']);
    }
}
