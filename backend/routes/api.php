<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\AuthController;

// Auth routes with web middleware
Route::post('auth/login', [AuthController::class, 'login']);
Route::group(['middleware' => ['api']], function () {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('auth/user', [AuthController::class, 'user']);
});

// Protected API routes
Route::prefix('v1')->middleware(['auth'])->group(function () {
    // Patient routes
    Route::apiResource('patients', App\Http\Controllers\PatientController::class);

    // Dashboard routes
    Route::get('/dashboard', [App\Http\Controllers\DashboardController::class, 'getData']);
});
