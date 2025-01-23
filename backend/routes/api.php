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

// Protected API routes
Route::middleware(['web', 'auth'])->prefix('v1')->group(function () {
    // Patient routes
    Route::apiResource('patients', App\Http\Controllers\PatientController::class);

    // Dashboard routes
    Route::get('/dashboard', [App\Http\Controllers\DashboardController::class, 'getData']);
});
