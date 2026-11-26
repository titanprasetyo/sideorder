@php
    $component = $page['component'] ?? '';
    $isCustomerView = str_starts_with($component, 'customer/');
    $htmlThemeClass = $isCustomerView ? 'theme-customer' : 'theme-oxanium';
    $bodyThemeClass = $isCustomerView ? 'theme-customer' : 'theme-sideline theme-oxanium';
@endphp
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="{{ $htmlThemeClass }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">

        {{-- SIDEORDER Cafe & Roastery signature theme (warm cream) --}}
        <script>
            (function() {
                // Ensure dark mode from OS does not turn cafe admin black
                document.documentElement.classList.remove('dark');
            })();
        </script>

        {{-- Typography: Oxanium (Admin & Cashier) and Outfit (Customer) --}}
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&family=Oxanium:wght@200..800&display=swap" rel="stylesheet">
        <style>
            :root {
                --font-family-outfit: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                --font-family-oxanium: 'Oxanium', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                --app-font-family: var(--font-family-outfit);
            }
            html.theme-oxanium,
            body.theme-oxanium,
            .theme-oxanium,
            .theme-sideline {
                --app-font-family: var(--font-family-oxanium);
                font-synthesis-weight: none;
            }
            html, body {
                background-color: #FAF6EC;
                color: #18181B;
                font-family: var(--app-font-family);
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                text-rendering: optimizeLegibility;
            }
        </style>

        <link rel="icon" href="/favicon.ico" sizes="any">
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">

        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        <x-inertia::head>
            <title>{{ config('app.name', 'Laravel') }}</title>
        </x-inertia::head>
    </head>
    <body class="{{ $bodyThemeClass }} font-sans antialiased selection:bg-[#C52828] selection:text-white">
        <x-inertia::app />
    </body>
</html>
