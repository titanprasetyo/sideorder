<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('menus', function (Blueprint $table): void {
            $table->unsignedInteger('stock_valid_days')->default(1)->after('stock_quantity');
            $table->timestamp('stock_updated_at')->nullable()->after('stock_valid_days');
        });

        DB::table('menus')
            ->where('is_limited_stock', true)
            ->whereNull('stock_updated_at')
            ->update([
                'stock_updated_at' => DB::raw('COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)'),
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('menus', function (Blueprint $table): void {
            $table->dropColumn([
                'stock_updated_at',
                'stock_valid_days',
            ]);
        });
    }
};
