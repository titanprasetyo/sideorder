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
        Schema::table('menus', function (Blueprint $table) {
            if (! Schema::hasColumn('menus', 'is_discount_active')) {
                $table->boolean('is_discount_active')->default(false)->after('base_price');
            }
            if (! Schema::hasColumn('menus', 'discount_type')) {
                $table->string('discount_type', 20)->nullable()->after('is_discount_active'); // 'percent' or 'fixed'
            }
            if (! Schema::hasColumn('menus', 'discount_value')) {
                $table->decimal('discount_value', 12, 2)->default(0.00)->after('discount_type');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('menus', function (Blueprint $table) {
            $columnsToDrop = [];
            if (Schema::hasColumn('menus', 'discount_value')) {
                $columnsToDrop[] = 'discount_value';
            }
            if (Schema::hasColumn('menus', 'discount_type')) {
                $columnsToDrop[] = 'discount_type';
            }
            if (Schema::hasColumn('menus', 'is_discount_active')) {
                $columnsToDrop[] = 'is_discount_active';
            }
            if (! empty($columnsToDrop)) {
                $table->dropColumn($columnsToDrop);
            }
        });
    }
};
