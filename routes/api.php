<?php

use App\Http\Controllers\Webhooks\FcGatewayWebhookController;
use Illuminate\Support\Facades\Route;

// Endpoint Webhook Callback dari FCGateway (bebas CSRF, diverifikasi server-to-server)
Route::post('/webhooks/fcgateway', [FcGatewayWebhookController::class, 'handle'])
    ->middleware('throttle:120,1')
    ->name('webhooks.fcgateway');
