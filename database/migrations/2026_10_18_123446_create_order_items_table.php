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
        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('menu_id')->nullable()->constrained('menus')->nullOnDelete();

            // Kolom Snapshot Produk
            $table->string('menu_name'); // Snapshot nama menu
            $table->decimal('base_price', 12, 2); // Snapshot harga dasar
            $table->integer('quantity'); // Jumlah porsi
            $table->decimal('subtotal_options', 12, 2)->default(0.00); // Total tambahan opsi per porsi
            $table->decimal('unit_price', 12, 2); // base_price + subtotal_options
            $table->decimal('total_price', 12, 2); // unit_price * quantity
            $table->text('customer_notes')->nullable(); // Catatan bebas per menu (misal: "less ice, normal sugar")
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('order_items');
    }
};