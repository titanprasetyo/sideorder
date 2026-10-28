<?php

namespace App\Http\Controllers\Customer;

use App\Events\OrderCreated;
use App\Events\OrderStatusUpdated;
use App\Http\Controllers\Controller;
use App\Http\Requests\Customer\CheckoutOrderRequest;
use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
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

        if (! $table || ! $table->is_active) {
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
                                        },
                                    ]);
                            },
                        ]);
                },
            ])
            ->get();

        // Pastikan grup ukuran (Ukuran / Size) selalu bernilai selection_type = 'single'
        // dan hanya grup dengan minimal 1 item aktif yang ditampilkan ke pelanggan.
        $categories->each(function ($category) {
            $category->menus->each(function ($menu) {
                $filteredGroups = $menu->optionGroups
                    ->filter(fn ($group) => $group->optionItems->isNotEmpty())
                    ->values()
                    ->map(function ($group) {
                        if (in_array(strtolower(trim($group->name)), ['ukuran', 'size'], true)) {
                            $group->selection_type = 'single';
                            $group->max_selection = 1;
                        }

                        return $group;
                    });

                $menu->setRelation('optionGroups', $filteredGroups);
            });
        });

        // Resolusi pesanan aktif pada meja ini agar customer dapat menambah menu ke pesanan yang sedang berjalan
        $requestedOrderNumber = trim((string) $request->query('order', ''));
        $forceNewOrder = $request->boolean('new');
        $activeOrder = null;
        $lockedOrderNotice = null;

        if (! $forceNewOrder && $requestedOrderNumber !== '') {
            $candidateOrder = Order::where('order_number', $requestedOrderNumber)
                ->where('cafe_table_id', $table->id)
                ->with(['items.options'])
                ->first();

            if ($candidateOrder) {
                if ($candidateOrder->canAcceptAdditionalItems()) {
                    $activeOrder = $candidateOrder;
                } else {
                    $statusLabels = [
                        'ready' => 'Siap Saji',
                        'completed' => 'Selesai',
                        'cancelled' => 'Dibatalkan',
                    ];
                    $statusLabel = $statusLabels[$candidateOrder->order_status] ?? strtoupper($candidateOrder->order_status);
                    $lockedOrderNotice = "Pesanan #{$candidateOrder->order_number} sudah berstatus {$statusLabel} dan tidak dapat ditambahkan menu lagi.";
                }
            }
        }

        $activeOrderPayload = $activeOrder ? [
            'id' => $activeOrder->id,
            'order_number' => $activeOrder->order_number,
            'customer_name' => $activeOrder->customer_name,
            'order_status' => $activeOrder->order_status,
            'payment_status' => $activeOrder->payment_status,
            'payment_method' => $activeOrder->payment_method,
            'subtotal' => (float) $activeOrder->subtotal,
            'total_amount' => (float) $activeOrder->total_amount,
            'settled_amount' => $activeOrder->getSettledAmount(),
            'unpaid_balance' => $activeOrder->getUnpaidBalance(),
            'notes' => $activeOrder->notes,
            'active_items_count' => (int) $activeOrder->items->where('status', 'active')->sum('quantity'),
            'items' => $activeOrder->items
                ->where('status', 'active')
                ->values()
                ->map(fn ($item) => [
                    'id' => $item->id,
                    'menu_name' => $item->menu_name,
                    'quantity' => (int) $item->quantity,
                    'unit_price' => (float) $item->unit_price,
                    'total_price' => (float) $item->total_price,
                    'customer_notes' => $item->customer_notes,
                    'options' => $item->options->map(fn ($opt) => [
                        'group_name' => $opt->group_name,
                        'option_name' => $opt->option_name,
                        'additional_price' => (float) $opt->additional_price,
                    ])->values()->all(),
                ])->all(),
        ] : null;

        return Inertia::render('customer/order', [
            'table' => [
                'id' => $table->id,
                'table_number' => $table->table_number,
                'name' => $table->name,
                'qr_token' => $table->qr_token,
            ],
            'categories' => $categories,
            'activeOrder' => $activeOrderPayload,
            'lockedOrderNotice' => $lockedOrderNotice,
        ]);
    }

    /**
     * Memproses checkout pesanan customer dengan kalkulasi harga anti-manipulasi.
     */
    public function checkout(CheckoutOrderRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        $table = CafeTable::where('qr_token', $validated['qr_token'])->firstOrFail();

        if (! $table->is_active) {
            return back()->withErrors(['table' => 'Meja sedang tidak aktif untuk pemesanan.']);
        }

        // Cegah duplikasi pesanan akibat double-click / request retry menggunakan idempotency key
        $idempotencyKey = ! empty($validated['idempotency_key'])
            ? 'checkout_idempotency:'.$table->id.':'. trim((string) $validated['idempotency_key'])
            : null;

        if ($idempotencyKey) {
            $existingOrderNumber = Cache::get($idempotencyKey);
            if ($existingOrderNumber) {
                return redirect()->route('order.status', ['order_number' => $existingOrderNumber]);
            }
        }

        [$order, $wasAppended] = DB::transaction(function () use ($validated, $table) {
            $addedSubtotal = 0.0;
            $itemsToCreate = [];

            // 1. Validasi keberadaan menu, ketersediaan varian, aturan grup opsi, & kalkulasi harga langsung dari database
            foreach ($validated['items'] as $index => $itemData) {
                $menu = Menu::with([
                    'optionGroups' => function ($gQuery) {
                        $gQuery->orderBy('sort_order', 'asc')
                            ->with([
                                'optionItems' => function ($iQuery) {
                                    $iQuery->where('is_active', true)->orderBy('sort_order', 'asc');
                                },
                            ]);
                    },
                ])->find($itemData['menu_id']);

                if (! $menu || ! $menu->is_active) {
                    throw ValidationException::withMessages([
                        "items.{$index}.menu_id" => 'Menu yang dipilih sedang tidak tersedia atau sudah tidak aktif.',
                    ]);
                }

                $quantity = (int) $itemData['quantity'];
                $basePrice = (float) $menu->base_price;

                $rawOptionIds = $itemData['selected_option_ids'] ?? [];
                $requestedOptionIds = array_values(array_unique(array_map('intval', $rawOptionIds)));

                // Petakan seluruh opsi aktif milik menu ini
                $validOptionsById = [];
                foreach ($menu->optionGroups as $group) {
                    foreach ($group->optionItems as $optItem) {
                        $validOptionsById[$optItem->id] = [
                            'item' => $optItem,
                            'group' => $group,
                        ];
                    }
                }

                // Pastikan seluruh ID opsi yang dikirim benar-benar milik menu ini dan berstatus aktif
                $selectedByGroup = [];
                foreach ($requestedOptionIds as $optId) {
                    if (! isset($validOptionsById[$optId])) {
                        throw ValidationException::withMessages([
                            "items.{$index}.selected_option_ids" => "Varian atau ukuran yang dipilih untuk {$menu->name} tidak valid atau sedang tidak tersedia.",
                        ]);
                    }

                    $group = $validOptionsById[$optId]['group'];
                    $selectedByGroup[$group->id][] = $validOptionsById[$optId]['item'];
                }

                // Validasi aturan setiap grup opsi pada menu (wajib dipilih, single vs multiple, max_selection)
                foreach ($menu->optionGroups as $group) {
                    if ($group->optionItems->isEmpty()) {
                        continue;
                    }

                    $selectedInGroup = $selectedByGroup[$group->id] ?? [];
                    $selectedCount = count($selectedInGroup);
                    $isSingleSelect = $group->selection_type === 'single'
                        || in_array(strtolower(trim($group->name)), ['ukuran', 'size'], true);

                    if ($group->is_required && $selectedCount < max(1, (int) $group->min_selection)) {
                        throw ValidationException::withMessages([
                            "items.{$index}.selected_option_ids" => "Pilihan {$group->name} wajib dipilih untuk menu {$menu->name}.",
                        ]);
                    }

                    if ($isSingleSelect && $selectedCount > 1) {
                        throw ValidationException::withMessages([
                            "items.{$index}.selected_option_ids" => "Hanya boleh memilih satu {$group->name} untuk menu {$menu->name}.",
                        ]);
                    }

                    if (! $isSingleSelect && $group->max_selection !== null && $selectedCount > (int) $group->max_selection) {
                        throw ValidationException::withMessages([
                            "items.{$index}.selected_option_ids" => "Pilihan {$group->name} untuk menu {$menu->name} maksimal {$group->max_selection} opsi.",
                        ]);
                    }
                }

                // Hitung harga opsi per unit dan bangun snapshot opsi secara deterministik sesuai urutan grup
                $optionsSubtotalPerUnit = 0.0;
                $optionsToCreate = [];

                foreach ($menu->optionGroups as $group) {
                    $selectedInGroup = $selectedByGroup[$group->id] ?? [];
                    foreach ($selectedInGroup as $optItem) {
                        $additionalPrice = (float) $optItem->additional_price;
                        $optionsSubtotalPerUnit += $additionalPrice;

                        $optionsToCreate[] = [
                            'group_name' => $group->name,
                            'option_name' => $optItem->name,
                            'additional_price' => $additionalPrice,
                        ];
                    }
                }

                $unitPrice = $basePrice + $optionsSubtotalPerUnit;
                $itemTotalPrice = $unitPrice * $quantity;
                $addedSubtotal += $itemTotalPrice;

                $customerNotes = isset($itemData['customer_notes']) && trim((string) $itemData['customer_notes']) !== ''
                    ? trim((string) $itemData['customer_notes'])
                    : null;

                $itemsToCreate[] = [
                    'menu_id' => $menu->id,
                    'menu_name' => $menu->name,
                    'base_price' => $basePrice,
                    'quantity' => $quantity,
                    'subtotal_options' => $optionsSubtotalPerUnit,
                    'unit_price' => $unitPrice,
                    'total_price' => $itemTotalPrice,
                    'customer_notes' => $customerNotes,
                    'status' => 'active',
                    'options' => $optionsToCreate,
                ];
            }

            // 2. Cek apakah pesanan harus digabungkan ke pesanan aktif yang sedang berjalan pada meja ini
            $requestedOrderNumber = isset($validated['order_number'])
                ? trim((string) $validated['order_number'])
                : '';
            $forceNewOrder = ! empty($validated['force_new_order']);
            $targetOrder = null;

            if (! $forceNewOrder && $requestedOrderNumber !== '') {
                $targetOrder = Order::where('order_number', $requestedOrderNumber)
                    ->where('cafe_table_id', $table->id)
                    ->lockForUpdate()
                    ->first();

                if (! $targetOrder) {
                    throw ValidationException::withMessages([
                        'order_number' => 'Pesanan aktif tidak ditemukan pada meja ini.',
                    ]);
                }

                if (! $targetOrder->canAcceptAdditionalItems()) {
                    throw ValidationException::withMessages([
                        'order_number' => "Pesanan #{$targetOrder->order_number} sudah berstatus {$targetOrder->order_status} dan tidak dapat ditambahkan menu lagi.",
                    ]);
                }
            }

            $incomingNotes = isset($validated['notes']) && trim((string) $validated['notes']) !== ''
                ? trim((string) $validated['notes'])
                : null;

            // SKENARIO A: Gabungkan menu baru ke pesanan aktif yang sama (pending / processing)
            if ($targetOrder) {
                $wasAlreadyPaid = $targetOrder->payment_status === 'paid';
                $previousTotalAmount = (float) $targetOrder->total_amount;
                $previouslySettled = $targetOrder->getSettledAmount();

                $addedSummaryParts = [];
                foreach ($itemsToCreate as $itemData) {
                    $options = $itemData['options'];
                    unset($itemData['options']);

                    $orderItem = $targetOrder->items()->create($itemData);

                    $optionNames = [];
                    foreach ($options as $optData) {
                        $orderItem->options()->create($optData);
                        $optionNames[] = $optData['option_name'];
                    }

                    $optSuffix = ! empty($optionNames) ? ' ('.implode(', ', $optionNames).')' : '';
                    $addedSummaryParts[] = "{$itemData['quantity']}x {$itemData['menu_name']}{$optSuffix}";
                }

                // Hitung ulang subtotal dan total tagihan dari seluruh item aktif pada pesanan
                $newSubtotal = (float) $targetOrder->items()->where('status', 'active')->sum('total_price');
                $newTotalAmount = $newSubtotal;

                $mergedNotes = $targetOrder->notes;
                if ($incomingNotes !== null) {
                    if (empty($mergedNotes)) {
                        $mergedNotes = $incomingNotes;
                    } elseif (! str_contains($mergedNotes, $incomingNotes)) {
                        $mergedNotes = "{$mergedNotes} | Tambahan: {$incomingNotes}";
                    }
                }

                $updatePayload = [
                    'subtotal' => $newSubtotal,
                    'total_amount' => $newTotalAmount,
                    'notes' => $mergedNotes,
                ];

                // Jika pembayaran sebelumnya sudah lunas, pertahankan data pembayaran awal (paid_at, cash_received, change_amount, confirmed_by, payment_reference)
                // dan tandai payment_status = 'unpaid' untuk menagih selisih menu tambahan secara aman.
                if ($wasAlreadyPaid) {
                    $existingNetCash = $targetOrder->cash_received !== null
                        ? max(0.0, (float) $targetOrder->cash_received - (float) ($targetOrder->change_amount ?? 0))
                        : 0.0;

                    if ($existingNetCash <= 0) {
                        $updatePayload['cash_received'] = $previousTotalAmount;
                        $updatePayload['change_amount'] = 0.0;
                    }

                    $updatePayload['payment_status'] = 'unpaid';
                }

                $targetOrder->update($updatePayload);

                $addedSummaryText = implode(', ', $addedSummaryParts);
                $addedSubtotalFormatted = number_format($addedSubtotal, 0, ',', '.');
                $newTotalFormatted = number_format($newTotalAmount, 0, ',', '.');

                if ($wasAlreadyPaid || $previouslySettled > 0) {
                    $settledFormatted = number_format($previouslySettled, 0, ',', '.');
                    $unpaidDiffFormatted = number_format(max(0.0, $newTotalAmount - $previouslySettled), 0, ',', '.');
                    $historyNote = "Customer menambahkan menu baru ({$addedSummaryText}) senilai Rp {$addedSubtotalFormatted} dari Meja {$table->table_number}. Pembayaran awal Rp {$settledFormatted} tetap tercatat; sisa tagihan tambahan Rp {$unpaidDiffFormatted} (Total: Rp {$newTotalFormatted}).";
                } else {
                    $historyNote = "Customer menambahkan menu baru ({$addedSummaryText}) senilai Rp {$addedSubtotalFormatted} dari Meja {$table->table_number}. Total tagihan diperbarui menjadi Rp {$newTotalFormatted}.";
                }

                OrderStatusHistory::create([
                    'order_id' => $targetOrder->id,
                    'user_id' => null,
                    'status' => $targetOrder->order_status,
                    'notes' => $historyNote,
                ]);

                return [$targetOrder->fresh(['table', 'items.options']), true];
            }

            // SKENARIO B: Buat pesanan induk baru jika tidak ada pesanan aktif pada meja ini
            $customerName = isset($validated['customer_name']) ? trim((string) $validated['customer_name']) : '';
            if ($customerName === '') {
                throw ValidationException::withMessages([
                    'customer_name' => 'Nama pemesan wajib diisi agar kasir dan barista dapat memanggil Anda.',
                ]);
            }

            $totalAmount = $addedSubtotal;

            $order = Order::create([
                'cafe_table_id' => $table->id,
                'customer_name' => $customerName,
                'subtotal' => $addedSubtotal,
                'total_amount' => $totalAmount,
                'order_status' => 'pending',
                'payment_status' => 'unpaid',
                'payment_method' => 'cash',
                'notes' => $incomingNotes,
            ]);

            foreach ($itemsToCreate as $itemData) {
                $options = $itemData['options'];
                unset($itemData['options']);

                $orderItem = $order->items()->create($itemData);

                foreach ($options as $optData) {
                    $orderItem->options()->create($optData);
                }
            }

            OrderStatusHistory::create([
                'order_id' => $order->id,
                'user_id' => null,
                'status' => 'pending',
                'notes' => "Pesanan baru dibuat oleh customer {$order->customer_name} dari Meja {$table->table_number}",
            ]);

            return [$order, false];
        });

        if ($idempotencyKey) {
            Cache::put($idempotencyKey, $order->order_number, now()->addMinutes(5));
        }

        // Siarkan event pesanan baru / pembaruan pesanan secara real-time
        try {
            event(new OrderCreated($order));
            if ($wasAppended) {
                event(new OrderStatusUpdated($order, $order->order_status, $order->order_status));
            }
        } catch (\Throwable $e) {
            // Jangan gagalkan checkout jika broadcaster log/driver bermasalah
        }

        return redirect()->route('order.status', ['order_number' => $order->order_number]);
    }

    /**
     * Halaman pelacakan status pesanan customer secara real-time.
     */
    public function status(string $order_number): Response
    {
        $order = Order::where('order_number', $order_number)
            ->with([
                'table',
                'items.options',
                'items.rejectedByUser',
                'statusHistories',
            ])
            ->firstOrFail();

        return Inertia::render('customer/status', [
            'order' => $order,
        ]);
    }
}
