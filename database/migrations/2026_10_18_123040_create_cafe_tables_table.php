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
        Schema::create('cafe_tables', function (Blueprint $table) {
            $table->id();
            $table->string('table_number')->unique(); // Misal: "01", "02", "VIP-1"
            $table->string('name')->nullable(); // Misal: "Teras Outdoor", "Lantai 1 Depan Bar"
            $table->string('qr_token', 64)->unique(); // Token acak untuk link QR code yang aman
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cafe_tables');
    }
};
