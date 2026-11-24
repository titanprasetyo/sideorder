export interface OrderBatchOption {
    id: number;
    group_name: string;
    option_name: string;
    additional_price: string;
}

export interface OrderBatchItem {
    id: number;
    menu_name: string;
    quantity: number;
    batch_number?: number;
    is_followup?: boolean;
    payment_status?: string;
    paid_at?: string | null;
    total_price: string;
    status?: string;
    is_served?: boolean;
    served_at?: string | null;
    served_by_user?: { id: number; name: string } | null;
    options?: OrderBatchOption[];
}

export interface OrderBatchOrderLike<
    TItem extends OrderBatchItem = OrderBatchItem,
> {
    total_amount: string | number;
    payment_status: string;
    order_status?: string;
    settled_amount?: number;
    unpaid_balance?: number;
    items: TItem[];
}

export interface OrderPaymentSummary<
    TItem extends OrderBatchItem = OrderBatchItem,
> {
    totalAmount: number;
    settledAmount: number;
    unpaidBalance: number;
    isFullyPaid: boolean;
    hasPartialFollowup: boolean;
    activeItems: TItem[];
}

export interface OrderBatchGroup<
    TItem extends OrderBatchItem = OrderBatchItem,
> {
    batchNumber: number;
    label: string;
    isFollowup: boolean;
    items: TItem[];
    activeItems: TItem[];
    batchTotal: number;
    isBatchPaid: boolean;
    paidCount: number;
    servedCount: number;
}

/**
 * Resolves effective payment status of an individual order item.
 */
export function getOrderItemPaymentStatus(
    item: OrderBatchItem,
    parentOrderPaymentStatus: string,
): 'paid' | 'unpaid' {
    if (item.payment_status === 'paid') {
        return 'paid';
    }
    if (item.payment_status === 'unpaid') {
        return 'unpaid';
    }

    return parentOrderPaymentStatus === 'paid' ? 'paid' : 'unpaid';
}

/**
 * Computes consistent order-level settlement summary including unpaid follow-up items.
 */
export function getOrderPaymentSummary<TItem extends OrderBatchItem>(
    order: OrderBatchOrderLike<TItem>,
): OrderPaymentSummary<TItem> {
    const activeItems = (order.items ?? []).filter(
        (it) => it.status !== 'rejected',
    );
    const totalAmount =
        typeof order.total_amount === 'string'
            ? parseFloat(order.total_amount) || 0
            : Number(order.total_amount) || 0;

    const rawUnpaidBalance =
        typeof order.unpaid_balance === 'number'
            ? Math.max(0, order.unpaid_balance)
            : order.payment_status === 'paid'
              ? 0
              : totalAmount;

    const rawSettledAmount =
        typeof order.settled_amount === 'number'
            ? Math.max(0, order.settled_amount)
            : order.payment_status === 'paid'
              ? totalAmount
              : 0;

    const unpaidItemsTotal = activeItems
        .filter(
            (it) =>
                getOrderItemPaymentStatus(it, order.payment_status) !== 'paid',
        )
        .reduce((sum, it) => sum + (parseFloat(it.total_price) || 0), 0);

    const hasUnpaidItem = activeItems.some(
        (it) => getOrderItemPaymentStatus(it, order.payment_status) !== 'paid',
    );
    const hasPaidItem = activeItems.some(
        (it) => getOrderItemPaymentStatus(it, order.payment_status) === 'paid',
    );

    const isFullyPaid =
        order.payment_status === 'paid' &&
        rawUnpaidBalance <= 0.01 &&
        !hasUnpaidItem;

    const unpaidBalance = isFullyPaid
        ? 0
        : Math.max(rawUnpaidBalance, unpaidItemsTotal);

    const hasPartialFollowup =
        !isFullyPaid &&
        (rawSettledAmount > 0.01 || hasPaidItem) &&
        (unpaidBalance > 0.01 || hasUnpaidItem);

    return {
        totalAmount,
        settledAmount: rawSettledAmount,
        unpaidBalance,
        isFullyPaid,
        hasPartialFollowup,
        activeItems,
    };
}

/**
 * Groups order items into initial vs sequential follow-up batches with per-batch status metadata.
 */
export function groupOrderItemsByBatch<TItem extends OrderBatchItem>(
    items: TItem[],
    parentOrderPaymentStatus: string,
    includeRejected = false,
): OrderBatchGroup<TItem>[] {
    const filtered = includeRejected
        ? items
        : items.filter((it) => it.status !== 'rejected');

    const map = new Map<number, TItem[]>();

    for (const item of filtered) {
        const batchNum = Math.max(1, Number(item.batch_number ?? 1) || 1);
        const bucket = map.get(batchNum);
        if (bucket) {
            bucket.push(item);
        } else {
            map.set(batchNum, [item]);
        }
    }

    const sortedBatchNumbers = Array.from(map.keys()).sort((a, b) => a - b);

    return sortedBatchNumbers.map((batchNumber) => {
        const batchItems = map.get(batchNumber) ?? [];
        const activeItems = batchItems.filter((it) => it.status !== 'rejected');
        const isFollowup =
            batchNumber > 1 || batchItems.some((it) => Boolean(it.is_followup));

        const label = isFollowup
            ? batchNumber <= 2
                ? 'Pesanan Susulan'
                : `Pesanan Susulan #${batchNumber - 1}`
            : 'Pesanan Awal';

        const batchTotal = activeItems.reduce(
            (sum, it) => sum + (parseFloat(it.total_price) || 0),
            0,
        );
        const paidCount = activeItems.filter(
            (it) =>
                getOrderItemPaymentStatus(it, parentOrderPaymentStatus) ===
                'paid',
        ).length;
        const servedCount = activeItems.filter((it) =>
            Boolean(it.is_served),
        ).length;
        const isBatchPaid =
            activeItems.length > 0
                ? paidCount === activeItems.length
                : parentOrderPaymentStatus === 'paid';

        return {
            batchNumber,
            label,
            isFollowup,
            items: batchItems,
            activeItems,
            batchTotal,
            isBatchPaid,
            paidCount,
            servedCount,
        };
    });
}

export interface OrderServingProgress<
    TItem extends OrderBatchItem = OrderBatchItem,
> {
    activeItems: TItem[];
    paidActiveItems: TItem[];
    servedPaidItems: TItem[];
    pendingPaidItems: TItem[];
    unpaidItems: TItem[];
    totalActiveCount: number;
    servedCount: number;
    remainingToServePaidCount: number;
    remainingTotalCount: number;
    isPartialReady: boolean;
    isReadyOrPartialReady: boolean;
}

/**
 * Computes item-level serving readiness for partial-ready visibility across Cashier, Admin, and Customer views.
 */
export function getOrderServingProgress<TItem extends OrderBatchItem>(
    order: OrderBatchOrderLike<TItem>,
): OrderServingProgress<TItem> {
    const activeItems = (order.items ?? []).filter(
        (it) => it.status !== 'rejected',
    );
    const paidActiveItems = activeItems.filter(
        (it) => getOrderItemPaymentStatus(it, order.payment_status) === 'paid',
    );
    const unpaidItems = activeItems.filter(
        (it) => getOrderItemPaymentStatus(it, order.payment_status) !== 'paid',
    );
    const servedPaidItems = paidActiveItems.filter((it) =>
        Boolean(it.is_served),
    );
    const pendingPaidItems = paidActiveItems.filter((it) => !it.is_served);

    const totalActiveCount = activeItems.length;
    const servedCount = servedPaidItems.length;
    const isPartialReady =
        order.order_status === 'processing' && servedCount > 0;
    const isReadyOrPartialReady =
        order.order_status === 'ready' || isPartialReady;

    return {
        activeItems,
        paidActiveItems,
        servedPaidItems,
        pendingPaidItems,
        unpaidItems,
        totalActiveCount,
        servedCount,
        remainingToServePaidCount: pendingPaidItems.length,
        remainingTotalCount: Math.max(0, totalActiveCount - servedCount),
        isPartialReady,
        isReadyOrPartialReady,
    };
}
