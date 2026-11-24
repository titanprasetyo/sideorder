<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('cafe_settings', function (Blueprint $table): void {
            $table->string('phone', 40)->nullable()->after('address');
            $table->string('receipt_footer', 255)->nullable()->after('phone');
            $table->boolean('is_ordering_enabled')->default(true)->after('receipt_footer');
            $table->string('closed_message', 255)->nullable()->after('is_ordering_enabled');
            $table->boolean('allow_cash_payment')->default(true)->after('closed_message');
            $table->boolean('allow_xendit_payment')->default(true)->after('allow_cash_payment');
            $table->unsignedInteger('payment_expiry_minutes')->default(15)->after('allow_xendit_payment');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('cafe_settings', function (Blueprint $table): void {
            $table->dropColumn([
                'phone',
                'receipt_footer',
                'is_ordering_enabled',
                'closed_message',
                'allow_cash_payment',
                'allow_xendit_payment',
                'payment_expiry_minutes',
            ]);
        });
    }
};
