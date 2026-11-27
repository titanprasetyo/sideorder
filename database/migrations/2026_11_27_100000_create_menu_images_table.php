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
        Schema::create('menu_images', function (Blueprint $table): void {
            $table->id();
            $table->string('path', 255)->unique();
            $table->string('mime_type', 100);
            $table->longText('content_base64');
            $table->unsignedInteger('size_bytes')->default(0);
            $table->string('etag', 64);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('menu_images');
    }
};
