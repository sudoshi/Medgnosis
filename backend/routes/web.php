<?php

use Illuminate\Support\Facades\Route;

// Frontend will handle all web routes
Route::get('/{path?}', function () {
    return view('welcome');
})->where('path', '.*');
