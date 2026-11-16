<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $driver = (string) config('services.payment_gateway.default_driver', 'xendit');
        $xenditConfigured = ! empty(config('services.xendit.secret_key'));

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $request->user(),
            ],
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'error' => fn () => $request->session()->get('error'),
                'info' => fn () => $request->session()->get('info'),
                'toast' => fn () => $request->session()->get('toast'),
            ],
            'paymentGateway' => [
                'driver' => $driver,
                'label' => $driver === 'midtrans' ? 'Midtrans Snap' : 'Xendit Payment Gateway',
                'isConfigured' => $xenditConfigured,
                'mode' => $xenditConfigured && config('services.xendit.is_production', false) ? 'production' : 'sandbox',
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }
}
