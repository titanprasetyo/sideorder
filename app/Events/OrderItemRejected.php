<?php

namespace App\Events;

use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrderItemRejected implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Order $order,
        public OrderItem $item
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
        return 'order.item.rejected';
    }

    public function broadcastWith(): array
    {
        $this->order->loadMissing(['table', 'items.options']);
        $this->item->loadMissing(['rejectedByUser']);

        return [
            'order' => $this->order,
            'rejected_item' => $this->item,
            'timestamp' => microtime(true),
        ];
    }
}
