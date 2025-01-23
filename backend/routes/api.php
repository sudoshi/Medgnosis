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

// Auth routes with better error handling
Route::middleware(['web'])->group(function () {
    Route::post('/login', [App\Http\Controllers\Auth\AuthController::class, 'login'])
        ->middleware(['throttle:6,1'])
        ->name('login');

    Route::post('/logout', [App\Http\Controllers\Auth\AuthController::class, 'logout'])
        ->middleware(['auth'])
        ->name('logout');

    Route::get('/user', [App\Http\Controllers\Auth\AuthController::class, 'user'])
        ->middleware(['auth'])
        ->name('user');
});

// Protected API routes
Route::middleware(['web', 'auth'])->prefix('v1')->group(function () {
    // Patient routes
    Route::apiResource('patients', App\Http\Controllers\PatientController::class);

    // Dashboard routes
    Route::get('/dashboard', [App\Http\Controllers\DashboardController::class, 'getData']);
});
