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
        Schema::table('orders', function (Blueprint $table) {
            $table->timestamp('paid_at')->nullable()->after('payment_method');
            $table->string('payment_reference', 100)->nullable()->unique()->after('paid_at');
            $table->decimal('cash_received', 12, 2)->nullable()->after('payment_reference');
            $table->decimal('change_amount', 12, 2)->nullable()->after('cash_received');
            $table->foreignId('confirmed_by')->nullable()->after('change_amount')->constrained('users')->nullOnDelete();
            $table->decimal('refunded_amount', 12, 2)->default(0.00)->after('confirmed_by');
            $table->timestamp('refunded_at')->nullable()->after('refunded_amount');
            $table->text('refund_reason')->nullable()->after('refunded_at');

            $table->index(['payment_status', 'order_status'], 'orders_payment_order_status_idx');
            $table->index('paid_at', 'orders_paid_at_idx');
            $table->index('created_at', 'orders_created_at_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex('orders_payment_order_status_idx');
            $table->dropIndex('orders_paid_at_idx');
            $table->dropIndex('orders_created_at_idx');
            $table->dropUnique(['payment_reference']);
            $table->dropForeign(['confirmed_by']);
            $table->dropColumn([
                'paid_at',
                'payment_reference',
                'cash_received',
                'change_amount',
                'confirmed_by',
                'refunded_amount',
                'refunded_at',
                'refund_reason',
            ]);
        });
    }
};
