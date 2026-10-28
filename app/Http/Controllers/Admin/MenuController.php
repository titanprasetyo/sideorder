<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\MenuRequest;
use App\Models\Category;
use App\Models\Menu;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class MenuController extends Controller
{
    /**
     * Menampilkan daftar menu beserta kategorinya.
     */
    public function index(): Response
    {
        $menus = Menu::with(['category', 'optionGroups.optionItems'])
            ->latest()
            ->get();

        $categories = Category::active()
            ->orderBy('sort_order', 'asc')
            ->get(['id', 'name']);

        return Inertia::render('admin/menus/index', [
            'menus' => $menus,
            'categories' => $categories,
        ]);
    }

    /**
     * Menyimpan menu baru beserta opsi ukuran/topping.
     */
    public function store(MenuRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        DB::transaction(function () use ($request, $validated) {
            // Upload Gambar jika ada
            $imagePath = null;
            if ($request->hasFile('image')) {
                $imagePath = $request->file('image')->store('menus', 'public');
            }

            if (empty($validated['slug'])) {
                $validated['slug'] = Str::slug($validated['name']).'-'.Str::random(4);
            }

            // Buat Menu
            $menu = Menu::create([
                'category_id' => $validated['category_id'],
                'name' => $validated['name'],
                'slug' => $validated['slug'],
                'description' => $validated['description'] ?? null,
                'image_path' => $imagePath,
                'base_price' => $validated['base_price'],
                'is_active' => $request->boolean('is_active', true),
            ]);

            // Buat Grup Opsi & Items jika ada
            if (! empty($validated['option_groups'])) {
                foreach ($validated['option_groups'] as $index => $groupData) {
                    $isSizeGroup = in_array(strtolower(trim($groupData['name'])), ['ukuran', 'size'], true);
                    $selectionType = $isSizeGroup ? 'single' : $groupData['selection_type'];

                    $group = $menu->optionGroups()->create([
                        'name' => $groupData['name'],
                        'selection_type' => $selectionType,
                        'is_required' => $groupData['is_required'] ?? false,
                        'min_selection' => $groupData['min_selection'] ?? 0,
                        'max_selection' => $selectionType === 'single' ? 1 : ($groupData['max_selection'] ?? null),
                        'sort_order' => $index,
                    ]);

                    foreach ($groupData['items'] as $itemIndex => $itemData) {
                        $group->optionItems()->create([
                            'name' => $itemData['name'],
                            'additional_price' => $itemData['additional_price'] ?? 0.00,
                            'is_default' => $itemData['is_default'] ?? false,
                            'is_active' => $itemData['is_active'] ?? true,
                            'sort_order' => $itemIndex,
                        ]);
                    }
                }
            }
        });

        return back()->with('success', 'Menu baru berhasil ditambahkan.');
    }

    /**
     * Memperbarui menu dan menyinkronkan opsi ukuran/topping.
     */
    public function update(MenuRequest $request, Menu $menu): RedirectResponse
    {
        $validated = $request->validated();

        DB::transaction(function () use ($request, $validated, $menu) {
            // Cek jika ada foto baru
            if ($request->hasFile('image')) {
                // Hapus foto lama
                if ($menu->image_path && Storage::disk('public')->exists($menu->image_path)) {
                    Storage::disk('public')->delete($menu->image_path);
                }
                $menu->image_path = $request->file('image')->store('menus', 'public');
            }

            if (empty($validated['slug'])) {
                $validated['slug'] = Str::slug($validated['name']).'-'.Str::random(4);
            }

            // Update info dasar menu
            $menu->update([
                'category_id' => $validated['category_id'],
                'name' => $validated['name'],
                'slug' => $validated['slug'],
                'description' => $validated['description'] ?? null,
                'base_price' => $validated['base_price'],
                'is_active' => $request->boolean('is_active', true),
            ]);

            // Sinkronisasi Grup Opsi: Hapus grup lama, buat grup baru
            $menu->optionGroups()->delete();

            if (! empty($validated['option_groups'])) {
                foreach ($validated['option_groups'] as $index => $groupData) {
                    $isSizeGroup = in_array(strtolower(trim($groupData['name'])), ['ukuran', 'size'], true);
                    $selectionType = $isSizeGroup ? 'single' : $groupData['selection_type'];

                    $group = $menu->optionGroups()->create([
                        'name' => $groupData['name'],
                        'selection_type' => $selectionType,
                        'is_required' => $groupData['is_required'] ?? false,
                        'min_selection' => $groupData['min_selection'] ?? 0,
                        'max_selection' => $selectionType === 'single' ? 1 : ($groupData['max_selection'] ?? null),
                        'sort_order' => $index,
                    ]);

                    foreach ($groupData['items'] as $itemIndex => $itemData) {
                        $group->optionItems()->create([
                            'name' => $itemData['name'],
                            'additional_price' => $itemData['additional_price'] ?? 0.00,
                            'is_default' => $itemData['is_default'] ?? false,
                            'is_active' => $itemData['is_active'] ?? true,
                            'sort_order' => $itemIndex,
                        ]);
                    }
                }
            }
        });

        return back()->with('success', 'Menu berhasil diperbarui.');
    }

    /**
     * Menghapus menu beserta fotonya.
     */
    public function destroy(Menu $menu): RedirectResponse
    {
        if ($menu->image_path && Storage::disk('public')->exists($menu->image_path)) {
            Storage::disk('public')->delete($menu->image_path);
        }

        $menu->delete();

        return back()->with('success', 'Menu berhasil dihapus.');
    }
}
