<?php

namespace App\Http\Middleware;

use App\Models\CafeSetting;
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
            'cafeSettings' => function (): array {
                try {
                    $setting = CafeSetting::current();

                    return [
                        'cafe_name' => $setting->cafe_name,
                        'address' => $setting->address,
                        'phone' => $setting->phone,
                        'receipt_footer' => $setting->receipt_footer,
                        'is_ordering_enabled' => (bool) $setting->is_ordering_enabled,
                        'closed_message' => $setting->closed_message,
                        'allow_cash_payment' => (bool) $setting->allow_cash_payment,
                        'allow_xendit_payment' => (bool) $setting->allow_xendit_payment,
                        'payment_expiry_minutes' => (int) ($setting->payment_expiry_minutes ?: CafeSetting::DEFAULT_PAYMENT_EXPIRY_MINUTES),
                    ];
                } catch (\Throwable) {
                    return [
                        'cafe_name' => 'Café SIDE LINE',
                        'address' => null,
                        'phone' => null,
                        'receipt_footer' => 'Terima kasih atas kunjungan Anda! Nikmati momen hangat di SIDE LINE.',
                        'is_ordering_enabled' => true,
                        'closed_message' => 'Pemesanan mandiri sedang ditutup sementara.',
                        'allow_cash_payment' => true,
                        'allow_xendit_payment' => true,
                        'payment_expiry_minutes' => 15,
                    ];
                }
            },
            'paymentGateway' => [
                'driver' => $driver,
                'label' => $driver === 'midtrans' ? 'Midtrans Snap' : 'Pembayaran Digital',
                'isConfigured' => $xenditConfigured,
                'mode' => $xenditConfigured && config('services.xendit.is_production', false) ? 'production' : 'sandbox',
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }
}
