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
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number')->unique(); // Misal: "SO-20261018-0001"
            $table->foreignId('cafe_table_id')->constrained('cafe_tables')->restrictOnDelete();
            $table->string('customer_name'); // Nama pemesan (wajib diisi customer)
            $table->decimal('subtotal', 12, 2);
            $table->decimal('total_amount', 12, 2);
            $table->string('order_status')->default('pending'); // pending, processing, ready, completed, cancelled
            $table->string('payment_status')->default('unpaid'); // unpaid, paid
            $table->string('payment_method')->nullable(); // cash, qris (disiapkan nanti)
            $table->text('notes')->nullable(); // Catatan global untuk kasir
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};