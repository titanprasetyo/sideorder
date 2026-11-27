<?php

namespace App\Http\Controllers\Customer;

use App\Events\OrderCreated;
use App\Events\OrderStatusUpdated;
use App\Exceptions\PaymentGatewayException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Customer\CheckoutOrderRequest;
use App\Models\CafeSetting;
use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Services\Geofencing\LocationAccessService;
use App\Services\Payments\PaymentService;
use App\Services\Stock\MenuStockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class OrderController extends Controller
{
    public function __construct(
        private readonly PaymentService $paymentService,
        private readonly LocationAccessService $locationAccessService,
        private readonly MenuStockService $menuStockService,
    ) {}

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

        $setting = CafeSetting::current();
        $locationAccess = $this->locationAccessService->getCustomerGateProps($request, $setting);
        $orderingStatus = [
            'enabled' => (bool) $setting->is_ordering_enabled,
            'closed_message' => $setting->closed_message ?: 'Pemesanan mandiri sedang ditutup sementara. Silakan hubungi kasir kami.',
            'cafe_name' => $setting->cafe_name,
        ];
        $allowCash = (bool) $setting->allow_cash_payment;
        $allowDigital = $this->paymentService->isDigitalPaymentEnabled($setting);
        $paymentPolicy = [
            'allow_cash' => $allowCash,
            'allow_digital' => $allowDigital,
            'expiry_minutes' => (int) ($setting->payment_expiry_minutes ?: CafeSetting::DEFAULT_PAYMENT_EXPIRY_MINUTES),
            'default_method' => $allowCash ? 'cash' : ($allowDigital ? 'qris' : 'cash'),
        ];

        if (! $setting->is_ordering_enabled) {
            return Inertia::render('customer/order', [
                'table' => [
                    'id' => $table->id,
                    'table_number' => $table->table_number,
                    'name' => $table->name,
                    'qr_token' => $table->qr_token,
                ],
                'categories' => [],
                'activeOrder' => null,
                'lockedOrderNotice' => null,
                'locationAccess' => $locationAccess,
                'orderingStatus' => $orderingStatus,
                'paymentPolicy' => $paymentPolicy,
            ]);
        }

        if ($locationAccess['required'] && ! $locationAccess['verified']) {
            return Inertia::render('customer/order', [
                'table' => [
                    'id' => $table->id,
                    'table_number' => $table->table_number,
                    'name' => $table->name,
                    'qr_token' => $table->qr_token,
                ],
                'categories' => [],
                'activeOrder' => null,
                'lockedOrderNotice' => null,
                'locationAccess' => $locationAccess,
                'orderingStatus' => $orderingStatus,
                'paymentPolicy' => $paymentPolicy,
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

                if ($menu->is_limited_stock && $menu->hasExpiredStock()) {
                    // Jangan simpan ke DB; hanya pastikan tampilan pelanggan otomatis menampilkan "Habis".
                    $menu->setAttribute('stock_quantity', 0);
                }
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
            'locationAccess' => $locationAccess,
            'orderingStatus' => $orderingStatus,
            'paymentPolicy' => $paymentPolicy,
        ]);
    }

    /**
     * Verifikasi koordinat GPS customer terhadap radius area Café SIDE LINE dan simpan ke session.
     */
    public function verifyLocation(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy' => ['nullable', 'numeric', 'min:0', 'max:100000'],
        ]);

        $result = $this->locationAccessService->verifyAndStoreSession(
            $request,
            (float) $validated['latitude'],
            (float) $validated['longitude'],
            isset($validated['accuracy']) ? (float) $validated['accuracy'] : null,
        );

        return response()->json([
            'allowed' => $result['allowed'],
            'restricted' => $result['restricted'],
            'distance_meters' => $result['distance_meters'],
            'radius_meters' => $result['radius_meters'],
            'message' => $result['message'],
        ], $result['allowed'] ? 200 : 403);
    }

    /**
     * Endpoint sinkronisasi stok menu secara real-time untuk halaman customer.
     */
    public function stockSync(Request $request): JsonResponse
    {
        $locationCheck = $this->locationAccessService->authorizeRequest($request);
        if (! $locationCheck['allowed']) {
            return response()->json([
                'message' => $locationCheck['message'],
                'location_required' => true,
            ], 403);
        }

        $menus = Menu::query()
            ->with('category:id,is_active')
            ->get([
                'id',
                'category_id',
                'is_active',
                'is_limited_stock',
                'stock_quantity',
                'stock_valid_days',
                'stock_updated_at',
                'updated_at',
                'created_at',
            ])
            ->map(fn (Menu $menu): array => [
                'id' => $menu->id,
                'is_active' => (bool) $menu->is_active && (bool) ($menu->category?->is_active ?? false),
                'is_limited_stock' => (bool) $menu->is_limited_stock,
                'stock_quantity' => $menu->is_limited_stock ? $menu->resolveEffectiveStockQuantity() : (int) $menu->stock_quantity,
                'is_stock_expired' => $menu->hasExpiredStock(),
            ])
            ->values()
            ->all();

        return response()->json([
            'menus' => $menus,
            'synced_at' => now()->toIso8601String(),
        ]);
    }

    /**
     * Memproses checkout pesanan customer dengan kalkulasi harga anti-manipulasi,
     * validasi geofencing backend, dan reservasi stok atomik.
     */
    public function checkout(CheckoutOrderRequest $request): RedirectResponse|SymfonyResponse
    {
        $validated = $request->validated();

        $table = CafeTable::where('qr_token', $validated['qr_token'])->firstOrFail();

        if (! $table->is_active) {
            return back()->withErrors(['table' => 'Meja sedang tidak aktif untuk pemesanan.']);
        }

        $setting = CafeSetting::current();
        if (! $setting->is_ordering_enabled) {
            throw ValidationException::withMessages([
                'ordering' => $setting->closed_message ?: 'Pemesanan mandiri sedang ditutup sementara. Silakan hubungi kasir kami.',
            ]);
        }

        $allowCash = (bool) $setting->allow_cash_payment;
        $allowDigital = $this->paymentService->isDigitalPaymentEnabled($setting);

        $requestedMethod = ! empty($validated['payment_method'])
            ? strtolower((string) $validated['payment_method'])
            : ($allowCash ? 'cash' : ($allowDigital ? 'qris' : 'cash'));

        if ($requestedMethod === 'qris' && ! $allowDigital) {
            throw ValidationException::withMessages([
                'payment_method' => 'Pembayaran QRIS digital sedang tidak aktif atau belum terkonfigurasi. Silakan gunakan metode Tunai di Kasir.',
            ]);
        }

        if ($requestedMethod === 'cash' && ! $allowCash) {
            throw ValidationException::withMessages([
                'payment_method' => 'Metode pembayaran tunai sedang dinonaktifkan sementara oleh kafe. Silakan hubungi kasir.',
            ]);
        }

        if (! in_array($requestedMethod, ['cash', 'qris'], true)) {
            throw ValidationException::withMessages([
                'payment_method' => 'Metode pembayaran yang dipilih tidak valid.',
            ]);
        }

        // Validasi ulang akses lokasi di backend agar tidak dapat dilewati melalui manipulasi request/API
        $incomingLat = isset($validated['customer_latitude']) && is_numeric($validated['customer_latitude'])
            ? (float) $validated['customer_latitude']
            : null;
        $incomingLng = isset($validated['customer_longitude']) && is_numeric($validated['customer_longitude'])
            ? (float) $validated['customer_longitude']
            : null;

        $locationCheck = $this->locationAccessService->authorizeRequest($request, $incomingLat, $incomingLng);
        if (! $locationCheck['allowed']) {
            throw ValidationException::withMessages([
                'location' => $locationCheck['message'],
            ]);
        }

        // Cegah duplikasi pesanan akibat double-click / request retry menggunakan idempotency key
        $idempotencyKey = ! empty($validated['idempotency_key'])
            ? 'checkout_idempotency:'.$table->id.':'.trim((string) $validated['idempotency_key'])
            : null;

        if ($idempotencyKey) {
            $existingOrderNumber = Cache::get($idempotencyKey);
            if (is_string($existingOrderNumber) && $existingOrderNumber !== '') {
                if ($requestedMethod === 'qris') {
                    $existingOrder = Order::where('order_number', $existingOrderNumber)
                        ->with('latestPayment')
                        ->first();
                    $existingCheckoutUrl = $existingOrder?->latestPayment?->status === 'pending'
                        ? $existingOrder->latestPayment->checkout_url
                        : null;

                    if (is_string($existingCheckoutUrl) && $existingCheckoutUrl !== '') {
                        return Inertia::location($existingCheckoutUrl);
                    }
                }

                return redirect()->route('order.status', ['order_number' => $existingOrderNumber]);
            }
        }

        [$order, $wasAppended] = DB::transaction(function () use ($validated, $table, $requestedMethod) {
            $addedSubtotal = 0.0;
            $itemsToCreate = [];

            // Agregasi total kuantitas per menu agar varian berbeda tetap mematuhi batas stok menu induk
            $requestedQtyByMenuId = [];
            $firstItemIndexByMenuId = [];
            foreach ($validated['items'] as $index => $itemData) {
                $menuId = (int) $itemData['menu_id'];
                $qty = (int) $itemData['quantity'];
                $requestedQtyByMenuId[$menuId] = ($requestedQtyByMenuId[$menuId] ?? 0) + $qty;
                if (! isset($firstItemIndexByMenuId[$menuId])) {
                    $firstItemIndexByMenuId[$menuId] = (int) $index;
                }
            }

            $lockedMenus = $this->menuStockService->lockAndReserveForCheckout(
                $requestedQtyByMenuId,
                $firstItemIndexByMenuId,
            );
            $reservedAt = now('Asia/Jakarta');

            // 1. Validasi keberadaan menu, ketersediaan varian, aturan grup opsi, & kalkulasi harga langsung dari database
            foreach ($validated['items'] as $index => $itemData) {
                /** @var Menu|null $menu */
                $menu = $lockedMenus->get((int) $itemData['menu_id']);

                if (! $menu || ! $menu->is_active || ! ($menu->category?->is_active ?? false)) {
                    throw ValidationException::withMessages([
                        "items.{$index}.menu_id" => 'Menu yang dipilih sedang tidak tersedia atau sudah tidak aktif.',
                    ]);
                }

                $quantity = (int) $itemData['quantity'];
                $basePrice = (float) $menu->final_price;

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
                    'cost_price' => $menu->cost_price !== null ? (float) $menu->cost_price : null,
                    'quantity' => $quantity,
                    'stock_deducted_quantity' => $menu->is_limited_stock ? $quantity : 0,
                    'stock_state' => $menu->is_limited_stock ? OrderItem::STOCK_STATE_RESERVED : OrderItem::STOCK_STATE_NONE,
                    'stock_deducted_at' => $menu->is_limited_stock ? $reservedAt : null,
                    'stock_released_at' => null,
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

                // Kunci item existing sebelum menentukan batch & menghitung ulang total tagihan
                $targetOrder->items()->lockForUpdate()->get();
                $followupBatchNumber = $targetOrder->getNextFollowupBatchNumber();

                $addedSummaryParts = [];
                foreach ($itemsToCreate as $itemData) {
                    $options = $itemData['options'];
                    unset($itemData['options']);

                    $itemData['batch_number'] = $followupBatchNumber;
                    $itemData['is_followup'] = true;
                    $itemData['payment_status'] = OrderItem::PAYMENT_UNPAID;
                    $itemData['is_served'] = false;

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

                // Tagihan pending gateway lama sudah tidak sesuai nominal terbarunya
                $targetOrder->payments()
                    ->where('status', 'pending')
                    ->update(['status' => 'expired']);

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

                if (! empty($validated['payment_method'])) {
                    $chosenMethod = strtolower((string) $validated['payment_method']);
                    $updatePayload['payment_method'] = $chosenMethod;
                    $updatePayload['payment_gateway'] = $this->paymentService->resolveGatewayForMethod($chosenMethod);
                    $updatePayload['payment_channel'] = $this->paymentService->resolveDefaultChannelForMethod(
                        $chosenMethod,
                        isset($validated['payment_channel']) ? (string) $validated['payment_channel'] : null,
                    );
                }

                // Jika pembayaran sebelumnya sudah lunas, pertahankan data pembayaran awal (paid_at, cash_received, change_amount, confirmed_by, payment_reference)
                // serta amankan riwayat pelunasan pada ledger `payments` sebelum menagih selisih menu tambahan.
                if ($wasAlreadyPaid) {
                    $this->paymentService->ensureLegacySettlementLedgered($targetOrder);

                    $existingNetCash = $targetOrder->cash_received !== null
                        ? max(0.0, (float) $targetOrder->cash_received - (float) ($targetOrder->change_amount ?? 0))
                        : 0.0;

                    if ($existingNetCash <= 0) {
                        $updatePayload['cash_received'] = $previousTotalAmount;
                        $updatePayload['change_amount'] = 0.0;
                    }

                    $updatePayload['payment_status'] = 'unpaid';
                } elseif ($targetOrder->payment_status === 'failed') {
                    $updatePayload['payment_status'] = 'unpaid';
                }

                $targetOrder->update($updatePayload);

                $addedSummaryText = implode(', ', $addedSummaryParts);
                $addedSubtotalFormatted = number_format($addedSubtotal, 0, ',', '.');
                $newTotalFormatted = number_format($newTotalAmount, 0, ',', '.');

                if ($wasAlreadyPaid || $previouslySettled > 0) {
                    $settledFormatted = number_format($previouslySettled, 0, ',', '.');
                    $unpaidDiffFormatted = number_format(max(0.0, $newTotalAmount - $previouslySettled), 0, ',', '.');
                    $historyNote = "Customer menambahkan menu susulan ({$addedSummaryText}) senilai Rp {$addedSubtotalFormatted} dari Meja {$table->table_number}. Pembayaran awal Rp {$settledFormatted} tetap tercatat; sisa tagihan tambahan Rp {$unpaidDiffFormatted} (Total: Rp {$newTotalFormatted}).";
                } else {
                    $historyNote = "Customer menambahkan menu susulan ({$addedSummaryText}) senilai Rp {$addedSubtotalFormatted} dari Meja {$table->table_number}. Total tagihan diperbarui menjadi Rp {$newTotalFormatted}.";
                }

                OrderStatusHistory::create([
                    'order_id' => $targetOrder->id,
                    'user_id' => null,
                    'status' => $targetOrder->order_status,
                    'notes' => $historyNote,
                ]);

                return [$targetOrder->fresh(['table', 'items.options']) ?? $targetOrder, true];
            }

            // SKENARIO B: Buat pesanan induk baru jika tidak ada pesanan aktif pada meja ini
            $customerName = isset($validated['customer_name']) ? trim((string) $validated['customer_name']) : '';
            if ($customerName === '') {
                throw ValidationException::withMessages([
                    'customer_name' => 'Nama pemesan wajib diisi agar kasir dan barista dapat memanggil Anda.',
                ]);
            }

            $totalAmount = $addedSubtotal;
            $chosenMethod = $requestedMethod;
            $resolvedGateway = $this->paymentService->resolveGatewayForMethod($chosenMethod);
            $resolvedChannel = $this->paymentService->resolveDefaultChannelForMethod(
                $chosenMethod,
                isset($validated['payment_channel']) ? (string) $validated['payment_channel'] : null,
            );

            $order = Order::create([
                'cafe_table_id' => $table->id,
                'customer_name' => $customerName,
                'subtotal' => $addedSubtotal,
                'total_amount' => $totalAmount,
                'order_status' => 'pending',
                'payment_status' => 'unpaid',
                'payment_method' => $chosenMethod,
                'payment_gateway' => $resolvedGateway,
                'payment_channel' => $resolvedChannel,
                'notes' => $incomingNotes,
            ]);

            foreach ($itemsToCreate as $itemData) {
                $options = $itemData['options'];
                unset($itemData['options']);

                $itemData['batch_number'] = 1;
                $itemData['is_followup'] = false;
                $itemData['payment_status'] = OrderItem::PAYMENT_UNPAID;
                $itemData['is_served'] = false;

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

        // Jika metode pembayaran QRIS aktif: hit FCGateway lalu arahkan pelanggan langsung ke Checkout Page gateway
        if ($order->payment_method === 'qris' && $allowDigital) {
            $amountDue = $wasAppended ? $order->getUnpaidBalance() : (float) $order->total_amount;

            try {
                $payment = $this->paymentService->createFcGatewayPayment(
                    $order,
                    $amountDue,
                    $wasAppended ? 'additional' : 'initial',
                );

                if (is_string($payment->checkout_url) && $payment->checkout_url !== '') {
                    return Inertia::location($payment->checkout_url);
                }
            } catch (PaymentGatewayException $e) {
                return redirect()
                    ->route('order.status', ['order_number' => $order->order_number])
                    ->with('error', $e->getMessage());
            }
        }

        return redirect()->route('order.status', ['order_number' => $order->order_number]);
    }

    /**
     * Halaman pelacakan status pesanan customer secara real-time.
     */
    public function status(Request $request, string $order_number): Response
    {
        $order = Order::where('order_number', $order_number)
            ->with([
                'table',
                'items.options',
                'items.rejectedByUser:id,name',
                'items.servedByUser:id,name',
                'statusHistories',
                'latestPayment',
                'payments:id,order_id,payment_reference,gateway,method,channel,type,amount,settled_amount,status,checkout_url,qr_string,expired_at,paid_at',
            ])
            ->firstOrFail();

        $order = $this->paymentService->syncPaymentStatus($order);

        $setting = CafeSetting::current();

        return Inertia::render('customer/status', [
            'order' => $order,
            'paymentGateway' => $this->paymentService->getPublicGatewayConfig(),
            'paymentPolicy' => [
                'allow_cash' => (bool) $setting->allow_cash_payment,
                'allow_digital' => $this->paymentService->isDigitalPaymentEnabled($setting),
                'expiry_minutes' => (int) ($setting->payment_expiry_minutes ?: CafeSetting::DEFAULT_PAYMENT_EXPIRY_MINUTES),
            ],
        ]);
    }

    /**
     * Mengganti pilihan metode pembayaran (Tunai <-> QRIS) atau membuat ulang tagihan QRIS FCGateway.
     */
    public function switchPaymentMethod(Request $request, string $order_number): RedirectResponse|JsonResponse|SymfonyResponse
    {
        $validated = $request->validate([
            'payment_method' => ['required', 'string', 'in:cash,qris'],
            'payment_channel' => ['nullable', 'string', 'max:50'],
        ]);

        $order = Order::where('order_number', $order_number)->firstOrFail();

        if (
            (in_array($order->payment_status, ['paid', 'refunded'], true) && $order->getUnpaidBalance() <= 0.01 && ! $order->hasUnpaidActiveItems())
            || $order->order_status === 'cancelled'
        ) {
            $errMsg = "Metode pembayaran untuk Pesanan #{$order->order_number} tidak dapat diubah karena pesanan sudah lunas atau dibatalkan.";
            if ($request->wantsJson()) {
                return response()->json([
                    'success' => false,
                    'message' => $errMsg,
                ], 422);
            }

            return back()->with('error', $errMsg);
        }

        $method = strtolower((string) $validated['payment_method']);
        $setting = CafeSetting::current();

        if ($method === 'cash' && ! $setting->allow_cash_payment) {
            $errMsg = 'Metode pembayaran tunai sedang dinonaktifkan sementara oleh kafe.';
            if ($request->wantsJson()) {
                return response()->json(['success' => false, 'message' => $errMsg], 422);
            }

            return back()->with('error', $errMsg);
        }

        if ($method === 'qris' && ! $this->paymentService->isDigitalPaymentEnabled($setting)) {
            $errMsg = 'Metode pembayaran QRIS digital sedang tidak aktif atau belum terkonfigurasi.';
            if ($request->wantsJson()) {
                return response()->json(['success' => false, 'message' => $errMsg], 422);
            }

            return back()->with('error', $errMsg);
        }

        $gateway = $this->paymentService->resolveGatewayForMethod($method);
        $channel = $this->paymentService->resolveDefaultChannelForMethod(
            $method,
            isset($validated['payment_channel']) ? (string) $validated['payment_channel'] : null,
        );

        try {
            DB::transaction(function () use ($order, $method, $gateway, $channel): void {
                /** @var Order $locked */
                $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
                if (
                    (in_array($locked->payment_status, ['paid', 'refunded'], true) && $locked->getUnpaidBalance() <= 0.01 && ! $locked->hasUnpaidActiveItems())
                    || $locked->order_status === 'cancelled'
                ) {
                    return;
                }

                $this->menuStockService->reserveBeforePaymentRetry($locked);

                $locked->payments()
                    ->where('status', 'pending')
                    ->where('method', '!=', $method)
                    ->update(['status' => 'expired']);

                $updatePayload = [
                    'payment_method' => $method,
                    'payment_gateway' => $gateway,
                    'payment_channel' => $channel,
                ];

                if ($locked->payment_status === 'failed' && ! $locked->hasAnySettlement()) {
                    $updatePayload['payment_status'] = 'unpaid';
                }

                $locked->update($updatePayload);
            });

            $order->refresh();

            $createdCheckoutUrl = null;
            $createdPaymentRef = null;
            if ($method === 'qris') {
                $payment = $this->paymentService->createFcGatewayPayment($order);
                $createdCheckoutUrl = $payment->checkout_url;
                $createdPaymentRef = $payment->payment_reference;
                $order->refresh();
            }
        } catch (PaymentGatewayException $e) {
            if ($request->wantsJson()) {
                return response()->json([
                    'success' => false,
                    'message' => $e->getMessage(),
                ], 422);
            }

            return back()->withErrors(['payment_method' => $e->getMessage()])->with('error', $e->getMessage());
        }

        try {
            event(new OrderStatusUpdated($order, $order->order_status, $order->order_status));
        } catch (\Throwable) {
        }

        if ($request->wantsJson()) {
            return response()->json([
                'success' => true,
                'payment_method' => $order->payment_method,
                'payment_gateway' => $order->payment_gateway,
                'payment_channel' => $order->payment_channel,
                'payment_reference' => $createdPaymentRef,
                'checkout_url' => $createdCheckoutUrl,
            ]);
        }

        if ($method === 'qris' && is_string($createdCheckoutUrl) && $createdCheckoutUrl !== '') {
            return Inertia::location($createdCheckoutUrl);
        }

        return back()->with('success', 'Metode pembayaran diperbarui.');
    }
}
