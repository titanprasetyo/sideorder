<?php

namespace App\Http\Controllers\Cashier;

use App\Http\Controllers\Controller;
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
     * Menampilkan daftar pesanan masuk untuk kasir dan dapur.
     */
    public function index(Request $request): Response
    {
        $statusFilter = $request->query('status', 'active'); // 'active', 'pending', 'processing', 'ready', 'completed', 'cancelled'

        $query = Order::with(['table', 'items.options', 'statusHistories.user'])
            ->latest();

        if ($statusFilter === 'active') {
            $query->whereNotIn('order_status', ['completed', 'cancelled']);
        } elseif ($statusFilter !== 'all') {
            $query->where('order_status', $statusFilter);
        }

        $orders = $query->paginate(30)->withQueryString();

        // Hitung ringkasan badge antrean
        $counts = [
            'pending' => Order::where('order_status', 'pending')->count(),
            'processing' => Order::where('order_status', 'processing')->count(),
            'ready' => Order::where('order_status', 'ready')->count(),
            'completed_today' => Order::where('order_status', 'completed')->whereDate('created_at', today())->count(),
        ];

        return Inertia::render('cashier/orders/index', [
            'orders' => $orders,
            'counts' => $counts,
            'currentFilter' => $statusFilter,
        ]);
    }

    /**
     * Konfirmasi pembayaran tunai oleh kasir.
     */
    public function confirmPayment(Request $request, Order $order): RedirectResponse
    {
        if ($order->payment_status === 'paid') {
            return back()->with('info', 'Pesanan ini sudah dibayar sebelumnya.');
        }

        DB::transaction(function () use ($request, $order) {
            $order->update([
                'payment_status' => 'paid',
                'payment_method' => 'cash',
                // Jika masih pending, langsung pindahkan ke tahap racik (processing)
                'order_status' => $order->order_status === 'pending' ? 'processing' : $order->order_status,
            ]);

            OrderStatusHistory::create([
                'order_id' => $order->id,
                'user_id' => $request->user()->id,
                'status' => $order->order_status,
                'notes' => 'Pembayaran tunai diterima dan dikonfirmasi oleh staf ' . $request->user()->name,
            ]);
        });

        return back()->with('success', "Pembayaran untuk Pesanan {$order->order_number} berhasil dikonfirmasi.");
    }

    /**
     * Memperbarui status operasional pesanan (processing -> ready -> completed / cancelled).
     */
    public function updateStatus(Request $request, Order $order): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:pending,processing,ready,completed,cancelled'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        DB::transaction(function () use ($request, $order, $validated) {
            $oldStatus = $order->order_status;
            $newStatus = $validated['status'];

            $order->update([
                'order_status' => $newStatus,
            ]);

            $auditNote = $validated['notes'] ?? "Status pesanan diubah dari {$oldStatus} ke {$newStatus} oleh staf {$request->user()->name}";

            OrderStatusHistory::create([
                'order_id' => $order->id,
                'user_id' => $request->user()->id,
                'status' => $newStatus,
                'notes' => $auditNote,
            ]);
        });

        return back()->with('success', "Status Pesanan {$order->order_number} berhasil diperbarui.");
    }
}