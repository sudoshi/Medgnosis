<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\AuthController;

// Auth routes with better error handling
Route::middleware(['web'])->group(function () {
    Route::post('/login', [AuthController::class, 'login'])
        ->middleware(['throttle:6,1'])
        ->name('login');

    Route::post('/logout', [AuthController::class, 'logout'])
        ->middleware(['auth'])
        ->name('logout');

    Route::get('/user', [AuthController::class, 'user'])
        ->middleware(['auth'])
        ->name('user');
});

// Frontend will handle all web routes
Route::get('/{path?}', function () {
    return view('welcome');
})->where('path', '.*');
