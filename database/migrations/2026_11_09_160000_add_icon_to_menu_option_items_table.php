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
        if (! Schema::hasColumn('menu_option_items', 'icon')) {
            Schema::table('menu_option_items', function (Blueprint $table) {
                $table->string('icon', 60)->nullable()->after('name');
            });
        }

        // Safely backfill existing records without destroying any data
        $items = DB::table('menu_option_items')
            ->orderBy('option_group_id')
            ->orderBy('sort_order')
            ->get(['id', 'option_group_id', 'name', 'icon', 'sort_order']);

        $grouped = $items->groupBy('option_group_id');

        foreach ($grouped as $groupItems) {
            foreach ($groupItems->values() as $idx => $item) {
                if (! empty($item->icon)) {
                    continue;
                }

                $lower = strtolower(trim((string) $item->name));
                $resolvedIcon = 'cup-medium';

                if (
                    str_contains($lower, 'small') ||
                    str_contains($lower, 'kecil') ||
                    str_contains($lower, 'mini') ||
                    $lower === 's'
                ) {
                    $resolvedIcon = 'cup-small';
                } elseif (
                    str_contains($lower, 'large') ||
                    str_contains($lower, 'besar') ||
                    str_contains($lower, 'jumbo') ||
                    str_contains($lower, 'upsize') ||
                    $lower === 'l' ||
                    $lower === 'xl'
                ) {
                    $resolvedIcon = 'cup-large';
                } elseif (
                    str_contains($lower, 'medium') ||
                    str_contains($lower, 'sedang') ||
                    str_contains($lower, 'regular') ||
                    str_contains($lower, 'reguler') ||
                    $lower === 'm' ||
                    $lower === 'r'
                ) {
                    $resolvedIcon = 'cup-medium';
                } elseif (str_contains($lower, 'botol') || str_contains($lower, 'bottle')) {
                    $resolvedIcon = 'bottle';
                } elseif (str_contains($lower, 'bowl') || str_contains($lower, 'mangkuk')) {
                    $resolvedIcon = 'bowl';
                } else {
                    $defaults = ['cup-small', 'cup-medium', 'cup-large'];
                    $resolvedIcon = $defaults[min((int) $idx, 2)];
                }

                DB::table('menu_option_items')
                    ->where('id', $item->id)
                    ->update(['icon' => $resolvedIcon]);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('menu_option_items', 'icon')) {
            Schema::table('menu_option_items', function (Blueprint $table) {
                $table->dropColumn('icon');
            });
        }
    }
};
