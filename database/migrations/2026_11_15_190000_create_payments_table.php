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
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->string('payment_reference', 120)->unique();
            $table->string('gateway', 30)->default('xendit')->index();
            $table->string('method', 30)->default('qris')->index();
            $table->string('channel', 50)->nullable();
            $table->string('type', 20)->default('initial');
            $table->decimal('amount', 12, 2);
            $table->decimal('settled_amount', 12, 2)->default(0);
            $table->decimal('cash_received', 12, 2)->nullable();
            $table->decimal('change_amount', 12, 2)->nullable();
            $table->decimal('fee_amount', 12, 2)->default(0);
            $table->string('status', 20)->default('pending')->index();
            $table->string('external_id', 120)->nullable()->index();
            $table->string('gateway_transaction_id', 120)->nullable();
            $table->text('checkout_url')->nullable();
            $table->text('qr_string')->nullable();
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->json('webhook_payload')->nullable();
            $table->timestamp('paid_at')->nullable()->index();
            $table->timestamp('expired_at')->nullable();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['order_id', 'status'], 'payments_order_status_idx');
            $table->index(['gateway', 'status'], 'payments_gateway_status_idx');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->string('payment_gateway', 30)->nullable()->after('payment_method');
            $table->string('payment_channel', 50)->nullable()->after('payment_gateway');

            $table->index('payment_gateway', 'orders_payment_gateway_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex('orders_payment_gateway_idx');
            $table->dropColumn(['payment_gateway', 'payment_channel']);
        });

        Schema::dropIfExists('payments');
    }
};
