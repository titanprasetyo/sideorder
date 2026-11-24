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
            $table->decimal('cost_price', 12, 2)->nullable()->after('base_price');
        });

        Schema::table('order_items', function (Blueprint $table): void {
            $table->decimal('cost_price', 12, 2)->nullable()->after('base_price');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table): void {
            $table->dropColumn('cost_price');
        });

        Schema::table('menus', function (Blueprint $table): void {
            $table->dropColumn('cost_price');
        });
    }
};
