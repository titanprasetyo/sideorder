<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\MenuRequest;
use App\Models\Category;
use App\Models\Menu;
use App\Models\MenuOptionGroup;
use App\Models\MenuOptionItem;
use App\Models\OrderItem;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
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

        DB::transaction(function () use ($request, $validated): void {
            // Upload Gambar jika ada
            $imagePath = null;
            $uploadedImage = $request->file('image');
            if ($uploadedImage instanceof UploadedFile) {
                $stored = $uploadedImage->store('menus', 'public');
                $imagePath = is_string($stored) ? $stored : null;
            }

            $slug = ! empty($validated['slug'])
                ? (string) $validated['slug']
                : Str::slug((string) $validated['name']).'-'.Str::random(4);

            $isDiscountActive = $request->boolean('is_discount_active', false);
            $discountType = $isDiscountActive ? (string) ($validated['discount_type'] ?? 'percent') : null;
            $discountValue = $isDiscountActive ? (float) ($validated['discount_value'] ?? 0) : 0.0;
            $isLimitedStock = $request->boolean('is_limited_stock', false);
            $stockQuantity = max(0, (int) ($validated['stock_quantity'] ?? 0));

            // Buat Menu
            $menu = Menu::create([
                'category_id' => (int) $validated['category_id'],
                'name' => (string) $validated['name'],
                'slug' => $slug,
                'description' => isset($validated['description']) ? (string) $validated['description'] : null,
                'image_path' => $imagePath,
                'base_price' => (float) $validated['base_price'],
                'is_discount_active' => $isDiscountActive,
                'discount_type' => $discountType,
                'discount_value' => $discountValue,
                'is_active' => $request->boolean('is_active', true),
                'is_limited_stock' => $isLimitedStock,
                'stock_quantity' => $stockQuantity,
            ]);

            $this->syncOptionGroups($menu, $validated['option_groups'] ?? []);
        });

        return back()->with('success', 'Menu baru berhasil ditambahkan.');
    }

    /**
     * Memperbarui menu dan menyinkronkan opsi ukuran/topping.
     */
    public function update(MenuRequest $request, Menu $menu): RedirectResponse
    {
        $validated = $request->validated();

        DB::transaction(function () use ($request, $validated, $menu): void {
            $uploadedImage = $request->file('image');
            if ($uploadedImage instanceof UploadedFile) {
                if ($menu->image_path && Storage::disk('public')->exists($menu->image_path)) {
                    Storage::disk('public')->delete($menu->image_path);
                }
                $stored = $uploadedImage->store('menus', 'public');
                $menu->image_path = is_string($stored) ? $stored : null;
            }

            $slug = ! empty($validated['slug'])
                ? (string) $validated['slug']
                : Str::slug((string) $validated['name']).'-'.Str::random(4);

            $isDiscountActive = $request->boolean('is_discount_active', false);
            $discountType = $isDiscountActive ? (string) ($validated['discount_type'] ?? 'percent') : null;
            $discountValue = $isDiscountActive ? (float) ($validated['discount_value'] ?? 0) : 0.0;
            $isLimitedStock = $request->boolean('is_limited_stock', false);
            $stockQuantity = $isLimitedStock
                ? max(0, (int) ($validated['stock_quantity'] ?? 0))
                : max(0, (int) ($validated['stock_quantity'] ?? $menu->stock_quantity ?? 0));

            $menu->update([
                'category_id' => (int) $validated['category_id'],
                'name' => (string) $validated['name'],
                'slug' => $slug,
                'description' => isset($validated['description']) ? (string) $validated['description'] : null,
                'base_price' => (float) $validated['base_price'],
                'is_discount_active' => $isDiscountActive,
                'discount_type' => $discountType,
                'discount_value' => $discountValue,
                'is_active' => $request->boolean('is_active', true),
                'is_limited_stock' => $isLimitedStock,
                'stock_quantity' => $stockQuantity,
            ]);

            $menu->optionGroups()->delete();
            $this->syncOptionGroups($menu, $validated['option_groups'] ?? []);
        });

        return back()->with('success', 'Menu berhasil diperbarui.');
    }

    /**
     * Memperbarui konfigurasi ikon ukuran produk secara langsung dari panel Admin.
     */
    public function updateSizeIcons(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['required', 'integer', 'exists:menu_option_items,id'],
            'items.*.icon' => ['required', 'string', Rule::in(MenuOptionItem::ALLOWED_ICONS)],
        ]);

        DB::transaction(function () use ($validated): void {
            foreach ($validated['items'] as $row) {
                MenuOptionItem::where('id', (int) $row['id'])->update([
                    'icon' => (string) $row['icon'],
                ]);
            }
        });

        return back()->with('success', 'Konfigurasi ikon ukuran berhasil diperbarui.');
    }

    /**
     * Menghapus menu beserta fotonya (diblokir jika masih ada pada pesanan aktif).
     */
    public function destroy(Menu $menu): RedirectResponse
    {
        $inActiveOrder = OrderItem::where('menu_id', $menu->id)
            ->where('status', 'active')
            ->whereHas('order', function ($query): void {
                $query->whereIn('order_status', ['pending', 'processing', 'ready']);
            })
            ->exists();

        if ($inActiveOrder) {
            return back()->with('error', 'Menu tidak dapat dihapus karena masih digunakan dalam pesanan aktif. Nonaktifkan menu terlebih dahulu.');
        }

        if ($menu->image_path && Storage::disk('public')->exists($menu->image_path)) {
            Storage::disk('public')->delete($menu->image_path);
        }

        $menu->delete();

        return back()->with('success', 'Menu berhasil dihapus.');
    }

    /**
     * Menyimpan grup opsi kustomisasi beserta itemnya untuk sebuah menu.
     *
     * @param  array<int, array<string, mixed>>  $optionGroups
     */
    private function syncOptionGroups(Menu $menu, array $optionGroups): void
    {
        foreach ($optionGroups as $index => $groupData) {
            $groupName = (string) ($groupData['name'] ?? '');
            $isSizeGroup = in_array(strtolower(trim($groupName)), ['ukuran', 'size'], true);
            $selectionType = $isSizeGroup ? 'single' : (string) ($groupData['selection_type'] ?? 'single');

            /** @var MenuOptionGroup $group */
            $group = $menu->optionGroups()->create([
                'name' => $groupName,
                'selection_type' => $selectionType,
                'is_required' => (bool) ($groupData['is_required'] ?? false),
                'min_selection' => (int) ($groupData['min_selection'] ?? 0),
                'max_selection' => $selectionType === 'single' ? 1 : (isset($groupData['max_selection']) ? (int) $groupData['max_selection'] : null),
                'sort_order' => (int) $index,
            ]);

            $items = is_array($groupData['items'] ?? null) ? $groupData['items'] : [];
            foreach ($items as $itemIndex => $itemData) {
                $itemName = (string) ($itemData['name'] ?? '');
                $group->optionItems()->create([
                    'name' => $itemName,
                    'icon' => MenuOptionItem::resolveIcon(
                        isset($itemData['icon']) ? (string) $itemData['icon'] : null,
                        $itemName,
                        (int) $itemIndex
                    ),
                    'additional_price' => (float) ($itemData['additional_price'] ?? 0.00),
                    'is_default' => (bool) ($itemData['is_default'] ?? false),
                    'is_active' => (bool) ($itemData['is_active'] ?? true),
                    'sort_order' => (int) $itemIndex,
                ]);
            }
        }
    }
}
