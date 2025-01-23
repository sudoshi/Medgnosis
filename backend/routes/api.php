<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/

// Public routes
Route::post('/login', [App\Http\Controllers\Auth\AuthController::class, 'login']);

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [App\Http\Controllers\Auth\AuthController::class, 'logout']);
    Route::get('/user', [App\Http\Controllers\Auth\AuthController::class, 'user']);

    // Core Clinical Data API
    Route::prefix('v1')->group(function () {
        // Patient routes
        Route::apiResource('patients', App\Http\Controllers\PatientController::class);

        // Dashboard routes
        Route::get('/dashboard', [App\Http\Controllers\DashboardController::class, 'getData']);
    });
});
