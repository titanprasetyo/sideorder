<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('cashier-orders', function ($user) {
    return in_array($user->role, ['admin', 'cashier']);
});

Broadcast::channel('order.{orderNumber}', function () {
    return true; // Publik untuk tracking customer
});
