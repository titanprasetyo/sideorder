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
        Schema::table('menus', function (Blueprint $table): void {
            $table->boolean('is_limited_stock')->default(false)->after('is_active');
            $table->unsignedInteger('stock_quantity')->default(0)->after('is_limited_stock');
        });

        Schema::table('order_items', function (Blueprint $table): void {
            $table->unsignedInteger('stock_deducted_quantity')->default(0)->after('quantity');
            $table->string('stock_state', 20)->default('none')->after('stock_deducted_quantity');
            $table->timestamp('stock_deducted_at')->nullable()->after('stock_state');
            $table->timestamp('stock_released_at')->nullable()->after('stock_deducted_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table): void {
            $table->dropColumn([
                'stock_deducted_quantity',
                'stock_state',
                'stock_deducted_at',
                'stock_released_at',
            ]);
        });

        Schema::table('menus', function (Blueprint $table): void {
            $table->dropColumn([
                'is_limited_stock',
                'stock_quantity',
            ]);
        });
    }
};
