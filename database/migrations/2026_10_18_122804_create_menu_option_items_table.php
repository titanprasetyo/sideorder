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
        Schema::create('menu_option_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('option_group_id')->constrained('menu_option_groups')->cascadeOnDelete();
            $table->string('name'); // Contoh: "Regular", "Large", "Normal Ice", "Extra Shot"
            $table->decimal('additional_price', 12, 2)->default(0.00); // 0 jika gratis, > 0 jika berbayar
            $table->boolean('is_default')->default(false); // Default tercentang saat buka modal
            $table->boolean('is_active')->default(true); // Status ketersediaan (jika topping habis)
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('menu_option_items');
    }
};
