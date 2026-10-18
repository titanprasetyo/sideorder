<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('order_item_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_item_id')->constrained('order_items')->cascadeOnDelete();

            // Kolom Snapshot Opsi
            $table->string('group_name'); // Misal: "Ukuran", "Tingkat Es", "Topping"
            $table->string('option_name'); // Misal: "Large", "Less Ice", "Extra Shot"
            $table->decimal('additional_price', 12, 2)->default(0.00); // Misal: 4000.00, 0.00, 5000.00
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('order_item_options');
    }
};