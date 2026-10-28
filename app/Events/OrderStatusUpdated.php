<?php

namespace App\Events;

use App\Models\Order;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrderStatusUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Order $order,
        public ?string $previousStatus = null,
        public ?string $newStatus = null
    ) {}

    public function broadcastOn(): array
    {
        return [
            new Channel('cashier-orders'),
            new Channel('order.'.$this->order->order_number),
        ];
    }

    public function broadcastAs(): string
    {
        return 'order.status.updated';
    }

    public function broadcastWith(): array
    {
        $this->order->loadMissing(['table', 'items.options']);

        return [
            'order' => $this->order,
            'previous_status' => $this->previousStatus,
            'new_status' => $this->newStatus ?? $this->order->order_status,
            'timestamp' => microtime(true),
        ];
    }
}
