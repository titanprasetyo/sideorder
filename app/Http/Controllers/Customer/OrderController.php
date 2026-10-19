<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Http\Requests\Customer\CheckoutOrderRequest;
use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\MenuOptionItem;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class OrderController extends Controller
{
    /**
     * Halaman katalog pemesanan menu customer berdasarkan token meja.
     */
    public function index(Request $request): Response
    {
        $qrToken = $request->query('table');

        // Validasi keberadaan meja
        $table = CafeTable::where('qr_token', $qrToken)->first();

        if (!$table || !$table->is_active) {
            return Inertia::render('customer/invalid-table', [
                'message' => 'Meja tidak ditemukan atau sedang tidak aktif. Silakan hubungi kasir atau barista.',
            ]);
        }

        // Ambil kategori aktif dan menu aktif beserta grup opsi & pilihannya
        $categories = Category::active()
            ->orderBy('sort_order', 'asc')
            ->with([
                'menus' => function ($query) {
                    $query->active()
                        ->with([
                            'optionGroups' => function ($gQuery) {
                                $gQuery->orderBy('sort_order', 'asc')
                                    ->with([
                                        'optionItems' => function ($iQuery) {
                                            $iQuery->active()->orderBy('sort_order', 'asc');
                                        }
                                    ]);
                            }
                        ]);
                }
            ])
            ->get();

        return Inertia::render('customer/order', [
            'table' => [
                'id' => $table->id,
                'table_number' => $table->table_number,
                'name' => $table->name,
                'qr_token' => $table->qr_token,
            ],
            'categories' => $categories,
        ]);
    }

    /**
     * Memproses checkout pesanan customer dengan kalkulasi harga anti-manipulasi.
     */
    public function checkout(CheckoutOrderRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        $table = CafeTable::where('qr_token', $validated['qr_token'])->firstOrFail();

        $order = DB::transaction(function () use ($validated, $table) {
            $subtotal = 0;
            $itemsToCreate = [];

            // 1. Validasi & kalkulasi harga tiap item langsung dari database
            foreach ($validated['items'] as $itemData) {
                $menu = Menu::findOrFail($itemData['menu_id']);
                $quantity = (int) $itemData['quantity'];
                $basePrice = (float) $menu->base_price;

                $optionsSubtotalPerUnit = 0;
                $optionsToCreate = [];

                if (!empty($itemData['selected_option_ids'])) {
                    $selectedItems = MenuOptionItem::with('optionGroup')
                        ->whereIn('id', $itemData['selected_option_ids'])
                        ->get();

                    foreach ($selectedItems as $optItem) {
                        $additionalPrice = (float) $optItem->additional_price;
                        $optionsSubtotalPerUnit += $additionalPrice;

                        $optionsToCreate[] = [
                            'group_name' => $optItem->optionGroup->name,
                            'option_name' => $optItem->name,
                            'additional_price' => $additionalPrice,
                        ];
                    }
                }

                $unitPrice = $basePrice + $optionsSubtotalPerUnit;
                $itemTotalPrice = $unitPrice * $quantity;
                $subtotal += $itemTotalPrice;

                $itemsToCreate[] = [
                    'menu_id' => $menu->id,
                    'menu_name' => $menu->name,
                    'base_price' => $basePrice,
                    'quantity' => $quantity,
                    'subtotal_options' => $optionsSubtotalPerUnit,
                    'unit_price' => $unitPrice,
                    'total_price' => $itemTotalPrice,
                    'customer_notes' => $itemData['customer_notes'] ?? null,
                    'options' => $optionsToCreate,
                ];
            }

            $totalAmount = $subtotal; // Siap ditambah pajak/service charge jika diperlukan di masa depan

            // 2. Buat pesanan induk
            $order = Order::create([
                'cafe_table_id' => $table->id,
                'customer_name' => $validated['customer_name'],
                'subtotal' => $subtotal,
                'total_amount' => $totalAmount,
                'order_status' => 'pending',
                'payment_status' => 'unpaid',
                'payment_method' => 'cash', // Default tunai di kasir (Midtrans di Tahap J)
                'notes' => $validated['notes'] ?? null,
            ]);

            // 3. Simpan item pesanan & opsi snapshot
            foreach ($itemsToCreate as $itemData) {
                $options = $itemData['options'];
                unset($itemData['options']);

                $orderItem = $order->items()->create($itemData);

                foreach ($options as $optData) {
                    $orderItem->options()->create($optData);
                }
            }

            // 4. Catat log status awal
            OrderStatusHistory::create([
                'order_id' => $order->id,
                'user_id' => null, // Dibuat otomatis oleh customer
                'status' => 'pending',
                'notes' => "Pesanan baru dibuat oleh customer {$validated['customer_name']} dari Meja {$table->table_number}",
            ]);

            return $order;
        });

        return redirect()->route('order.status', ['order_number' => $order->order_number]);
    }

    /**
     * Halaman pelacakan status pesanan customer secara real-time.
     */
    public function status(string $order_number): Response
    {
        $order = Order::where('order_number', $order_number)
            ->with(['table', 'items.options', 'statusHistories'])
            ->firstOrFail();

        return Inertia::render('customer/status', [
            'order' => $order,
        ]);
    }
}