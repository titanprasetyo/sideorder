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
        Schema::table('order_items', function (Blueprint $table): void {
            $table->unsignedSmallInteger('batch_number')->default(1)->after('quantity');
            $table->boolean('is_followup')->default(false)->after('batch_number');
            $table->string('payment_status', 20)->default('unpaid')->after('is_followup');
            $table->foreignId('payment_id')->nullable()->after('payment_status')->constrained('payments')->nullOnDelete();
            $table->timestamp('paid_at')->nullable()->after('payment_id');

            $table->boolean('is_served')->default(false)->after('status');
            $table->timestamp('served_at')->nullable()->after('is_served');
            $table->foreignId('served_by')->nullable()->after('served_at')->constrained('users')->nullOnDelete();

            $table->index(['order_id', 'batch_number'], 'order_items_order_batch_idx');
            $table->index('payment_status', 'order_items_payment_status_idx');
        });

        // Backfill data existing secara aman lintas engine SQLite/MySQL/PostgreSQL
        DB::table('orders')->orderBy('id')->chunkById(200, function ($orders): void {
            foreach ($orders as $order) {
                $paidAtFallback = $order->paid_at ?? $order->updated_at ?? $order->created_at;

                if ($order->payment_status === 'paid') {
                    DB::table('order_items')
                        ->where('order_id', $order->id)
                        ->update([
                            'payment_status' => 'paid',
                            'paid_at' => $paidAtFallback,
                        ]);
                } else {
                    $paidLedgerSum = (float) DB::table('payments')
                        ->where('order_id', $order->id)
                        ->where('status', 'paid')
                        ->sum('settled_amount');

                    if ($paidLedgerSum > 0) {
                        $remainingCredit = $paidLedgerSum;
                        $items = DB::table('order_items')
                            ->where('order_id', $order->id)
                            ->where('status', 'active')
                            ->orderBy('id')
                            ->get();

                        $batchSeq = 1;
                        $sawPaid = false;

                        foreach ($items as $item) {
                            $itemTotal = (float) $item->total_price;
                            if ($remainingCredit + 0.01 >= $itemTotal) {
                                $remainingCredit -= $itemTotal;
                                $sawPaid = true;
                                DB::table('order_items')
                                    ->where('id', $item->id)
                                    ->update([
                                        'batch_number' => $batchSeq,
                                        'is_followup' => $batchSeq > 1,
                                        'payment_status' => 'paid',
                                        'paid_at' => $paidAtFallback,
                                    ]);
                            } else {
                                $unpaidBatch = $sawPaid ? 2 : 1;
                                DB::table('order_items')
                                    ->where('id', $item->id)
                                    ->update([
                                        'batch_number' => $unpaidBatch,
                                        'is_followup' => $unpaidBatch > 1,
                                        'payment_status' => 'unpaid',
                                    ]);
                            }
                        }
                    }
                }

                if (in_array($order->order_status, ['ready', 'completed'], true)) {
                    DB::table('order_items')
                        ->where('order_id', $order->id)
                        ->where('status', 'active')
                        ->update([
                            'is_served' => true,
                            'served_at' => $order->updated_at ?? $order->created_at,
                        ]);
                }
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table): void {
            $table->dropIndex('order_items_order_batch_idx');
            $table->dropIndex('order_items_payment_status_idx');
            $table->dropForeign(['payment_id']);
            $table->dropForeign(['served_by']);
            $table->dropColumn([
                'batch_number',
                'is_followup',
                'payment_status',
                'payment_id',
                'paid_at',
                'is_served',
                'served_at',
                'served_by',
            ]);
        });
    }
};
