<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'fcgateway' => [
        'enabled' => filter_var(env('FCGATEWAY_ENABLED', true), FILTER_VALIDATE_BOOLEAN),
        'base_url' => rtrim(trim((string) env('FCGATEWAY_BASE_URL', '')), '/'),
        'api_key' => trim((string) env('FCGATEWAY_API_KEY', '')),
        'webhook_secret' => trim((string) env('FCGATEWAY_WEBHOOK_SECRET', '')),
        'callback_url' => trim((string) env('FCGATEWAY_CALLBACK_URL', '')),
        'timeout' => max(5, (int) env('FCGATEWAY_TIMEOUT', 15)),
    ],

];
