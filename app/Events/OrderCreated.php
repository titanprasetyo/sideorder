<?php

namespace App\Events;

use App\Models\Order;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrderCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Order $order
    ) {}

    /**
     * Nama channel siaran real-time.
     */
    public function broadcastOn(): array
    {
        return [
            new Channel('cashier-orders'),
        ];
    }

    /**
     * Nama event siaran.
     */
    public function broadcastAs(): string
    {
        return 'order.created';
    }

    /**
     * Payload data siaran real-time.
     */
    public function broadcastWith(): array
    {
        $this->order->loadMissing(['table', 'items.options']);

        return [
            'order' => $this->order,
            'timestamp' => microtime(true),
        ];
    }
}
