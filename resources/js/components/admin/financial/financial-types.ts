export interface SummaryPeriodCashFlow {
    inflow_total: number;
    inflow_gross?: number;
    inflow_cash: number;
    inflow_qris: number;
    inflow_transfer: number;
    inflow_debit?: number;
    inflow_xendit: number;
    outflow_refund: number;
    outflow_expenses_cash: number;
    outflow_expenses_bank: number;
    outflow_expenses_total: number;
    net_cash_drawer: number;
    net_bank_digital: number;
    net_cash_flow: number;
}

export interface PaymentMethodBreakdown {
    method: string;
    label: string;
    transactions_count: number;
    net_revenue: number;
    revenue_share_percent: number;
    count_share_percent: number;
    unpaid_count: number;
    unpaid_amount: number;
    cancelled_count: number;
    cancelled_amount: number;
}

export interface PaymentGatewayBreakdown {
    gateway: string;
    label: string;
    transactions_count: number;
    net_revenue: number;
    revenue_share_percent: number;
    count_share_percent: number;
    unpaid_count: number;
    unpaid_amount: number;
    cancelled_count: number;
    cancelled_amount: number;
    is_active_slot: boolean;
}

export interface FinancialSummary {
    today_revenue: number;
    today_cogs?: number;
    today_expenses?: number;
    today_net_profit?: number;
    today_paid_count: number;
    today_orders_count: number;
    today_items_sold: number;
    yesterday_revenue: number;
    today_growth_percent: number;
    this_week_revenue: number;
    this_week_label: string;
    this_week_growth_percent: number;
    this_month_revenue: number;
    this_month_cogs?: number;
    this_month_expenses?: number;
    this_month_net_profit?: number;
    this_month_label: string;
    this_month_growth_percent: number;
    period: {
        label: string;
        net_revenue: number;
        previous_period_revenue: number;
        net_revenue_diff: number;
        period_growth_percent: number;
        previous_period_label: string | null;
        gross_revenue: number;
        total_orders_count: number;
        completed_orders_count: number;
        paid_transactions_count: number;
        previous_paid_count: number;
        average_order_value: number;
        previous_aov: number;
        aov_growth_percent: number;
        items_sold: number;
        previous_items_sold: number;
        items_sold_growth_percent: number;
        pending_payments_count: number;
        pending_payments_amount: number;
        failed_or_cancelled_count?: number;
        cancelled_orders_count: number;
        cancelled_amount: number;
        failed_payments_count: number;
        failed_or_cancelled_amount?: number;
        refunded_count: number;
        refund_amount: number;
        cogs_amount: number;
        previous_cogs_amount: number;
        cogs_diff: number;
        cogs_growth_percent: number;
        cogs_coverage_percent: number;
        cogs_covered_items: number;
        cogs_total_items: number;
        menus_missing_cost_count: number;
        cogs_status: 'complete' | 'partial' | 'unavailable';
        cogs_message: string;
        gross_profit: number;
        previous_gross_profit: number;
        gross_profit_diff: number;
        gross_profit_growth_percent: number;
        gross_margin_percent: number;
        operational_expenses: number;
        operational_expenses_cash: number;
        operational_expenses_bank: number;
        operational_expenses_count: number;
        previous_operational_expenses: number;
        operational_expenses_diff: number;
        operational_expenses_growth_percent: number;
        operational_expenses_status: string;
        operational_expenses_message: string;
        net_profit: number;
        previous_net_profit: number;
        net_profit_diff: number;
        net_profit_growth_percent: number;
        net_margin_percent: number;
        net_profit_status: string;
        net_profit_message: string;
        cash_flow: SummaryPeriodCashFlow;
    };
    payment_methods: PaymentMethodBreakdown[];
    payment_gateways: PaymentGatewayBreakdown[];
    xendit_integration: {
        driver: string;
        label: string;
        configured: boolean;
        is_production: boolean;
        mode: string;
        webhook_endpoint: string;
        supported_channels: string[];
        transactions_count: number;
        net_revenue: number;
        pending_count: number;
        pending_amount: number;
    };
}

export interface ChartPoint {
    key: string;
    label: string;
    full_label: string;
    net_revenue: number;
    gross_revenue: number;
    paid_orders_count: number;
    total_orders_count: number;
    items_sold: number;
    unpaid_amount: number;
    refund_amount: number;
    average_order_value: number;
}

export interface ChartComparisonPoint {
    index: number;
    current_key: string;
    current_label: string;
    current_revenue: number;
    current_orders: number;
    previous_key: string;
    previous_label: string;
    previous_revenue: number;
    previous_orders: number;
    revenue_diff: number;
    growth_percent: number;
}

export interface FinancialChart {
    aggregation: 'daily' | 'weekly' | 'monthly';
    has_transactions: boolean;
    max_revenue: number;
    total_revenue: number;
    total_paid_orders: number;
    data: ChartPoint[];
    comparison: ChartComparisonPoint[];
}

export interface ReportFilters {
    period: string;
    preset: string;
    start_date: string;
    end_date: string;
    period_label: string;
    compare_mode: string;
    compare_start_date: string;
    compare_end_date: string;
    compare_label: string | null;
    filter_date?: string;
    menu_id?: number | null;
    aggregation: string;
    effective_aggregation: 'daily' | 'weekly' | 'monthly';
    recap_view?: 'daily' | 'weekly' | 'monthly';
    search?: string;
    payment_status?: string;
    order_status?: string;
    payment_method?: string;
    payment_gateway?: string;
    sort_by?: string;
    sort_dir?: string;
    per_page?: number;
}

export interface TopMenuEntry {
    rank?: number;
    menu_name: string;
    category_name?: string;
    total_qty: number;
    total_revenue: number;
    total_cogs?: number;
    gross_profit?: number;
    margin_percent?: number;
    relative_percentage?: number;
    contribution_percent?: number;
}

export interface ExpenseRecord {
    id: number;
    expense_date: string;
    expense_date_formatted: string;
    category: string;
    category_label: string;
    title: string;
    amount: number;
    payment_source: string;
    payment_source_label: string;
    notes: string | null;
    recorded_by_name: string;
    created_at_formatted: string;
}

export interface ExpenseCategoryBreakdown {
    category: string;
    label: string;
    count: number;
    amount: number;
    share_percent: number;
}

export interface ExpensesAnalytics {
    count: number;
    total_amount: number;
    cash_amount: number;
    bank_amount: number;
    by_category: ExpenseCategoryBreakdown[];
    items: ExpenseRecord[];
    categories: Record<string, string>;
    payment_sources: Record<string, string>;
}

export interface PeriodRecapRow {
    date?: string;
    week_key?: string;
    month_key?: string;
    day_name?: string;
    short_label: string;
    label: string;
    total_orders: number;
    completed_orders_count: number;
    paid_orders_count: number;
    unpaid_orders_count: number;
    cancelled_orders_count: number;
    gross_revenue: number;
    refund_amount: number;
    net_revenue: number;
    cogs_amount: number;
    gross_profit: number;
    operational_expense: number;
    net_profit: number;
    unpaid_amount: number;
    average_order_value: number;
    items_sold: number;
    is_peak?: boolean;
    is_lowest?: boolean;
}

export interface TransactionRecord {
    id: number;
    order_number: string;
    customer_name: string;
    table_number: string;
    table_name: string | null;
    transaction_date_formatted: string;
    created_at_formatted: string;
    paid_at_formatted: string | null;
    payment_method: string | null;
    payment_method_label: string;
    payment_gateway: string;
    payment_gateway_label: string;
    payment_channel: string | null;
    payment_reference: string | null;
    payment_status: string;
    payment_status_label: string;
    order_status: string;
    order_status_label: string;
    initial_gross_amount: number;
    rejected_items_amount: number;
    subtotal: number;
    refund_amount: number;
    refunded_at_formatted: string | null;
    refund_reason: string | null;
    total_amount: number;
    net_revenue: number;
    is_realized_revenue: boolean;
    cash_received: number | null;
    change_amount: number | null;
    confirmed_by_name: string | null;
    notes: string | null;
    items_summary: string;
    items: {
        id: number;
        menu_name: string;
        quantity: number;
        base_price: number;
        subtotal_options: number;
        unit_price: number;
        total_price: number;
        customer_notes: string | null;
        status: string;
        rejection_reason: string | null;
        rejected_at_formatted: string | null;
        rejected_by_name: string | null;
        options: {
            id: number;
            group_name: string;
            option_name: string;
            additional_price: number;
        }[];
    }[];
    status_histories: {
        id: number;
        status: string;
        status_label: string;
        notes: string | null;
        created_at_formatted: string;
        actor_name: string;
    }[];
}

export function formatRupiah(amount: number): string {
    const rounded = Math.round(amount || 0);
    const sign = rounded < 0 ? '-' : '';
    return `${sign}Rp ${Math.abs(rounded).toLocaleString('id-ID')}`;
}

export function formatCompactRupiah(amount: number): string {
    const abs = Math.abs(amount || 0);
    const sign = amount < 0 ? '-' : '';
    if (abs >= 1_000_000_000) {
        return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1)} M`;
    }
    if (abs >= 1_000_000) {
        return `${sign}Rp ${(abs / 1_000_000).toFixed(1)} Jt`;
    }
    if (abs >= 1_000) {
        return `${sign}Rp ${Math.round(abs / 1_000)} Rb`;
    }
    return formatRupiah(amount);
}
