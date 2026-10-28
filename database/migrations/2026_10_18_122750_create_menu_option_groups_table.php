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
        Schema::create('menu_option_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('menu_id')->constrained('menus')->cascadeOnDelete();
            $table->string('name'); // Contoh: "Ukuran", "Tingkat Es", "Pilihan Saus", "Topping"
            $table->string('selection_type')->default('single'); // 'single' atau 'multiple'
            $table->boolean('is_required')->default(false); // Wajib dipilih atau tidak
            $table->integer('min_selection')->default(0); // Minimal pilihan (1 jika wajib)
            $table->integer('max_selection')->nullable(); // Maksimal pilihan (misal max 3 topping)
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('menu_option_groups');
    }
};
