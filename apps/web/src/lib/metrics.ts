import { register, Counter, Histogram, Gauge, Summary } from 'prom-client';

// Initialize default metrics
import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({ register });

// HTTP Request Metrics
export const httpRequestsTotal = new Counter({
  name: 'warehouse_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'warehouse_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpErrorsTotal = new Counter({
  name: 'warehouse_http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'path', 'status', 'error_type'],
  registers: [register],
});

// Business Metrics - Warehouses
export const warehouseStatus = new Gauge({
  name: 'warehouse_status',
  help: 'Current status of warehouses',
  labelNames: ['warehouse_id', 'status', 'city', 'state'],
  registers: [register],
});

export const totalWarehouses = new Gauge({
  name: 'warehouse_total_warehouses',
  help: 'Total number of warehouses',
  registers: [register],
});

export const warehouseStorageUtilization = new Gauge({
  name: 'warehouse_storage_utilization',
  help: 'Storage utilization percentage by warehouse',
  labelNames: ['warehouse_id', 'city'],
  registers: [register],
});

// Business Metrics - Orders
export const ordersCreatedTotal = new Counter({
  name: 'warehouse_orders_created_total',
  help: 'Total number of orders created',
  labelNames: ['warehouse_id', 'order_type'],
  registers: [register],
});

export const ordersCompletedTotal = new Counter({
  name: 'warehouse_orders_completed_total',
  help: 'Total number of orders completed',
  labelNames: ['warehouse_id', 'order_type'],
  registers: [register],
});

export const ordersCancelledTotal = new Counter({
  name: 'warehouse_orders_cancelled_total',
  help: 'Total number of orders cancelled',
  labelNames: ['warehouse_id', 'order_type', 'cancellation_reason'],
  registers: [register],
});

export const ordersPending = new Gauge({
  name: 'warehouse_orders_pending',
  help: 'Number of pending orders',
  labelNames: ['warehouse_id'],
  registers: [register],
});

export const orderProcessingTime = new Summary({
  name: 'warehouse_order_processing_time_seconds',
  help: 'Time taken to process orders',
  labelNames: ['warehouse_id', 'order_type'],
  percentiles: [0.5, 0.9, 0.95, 0.99],
  registers: [register],
});

// Business Metrics - Revenue
export const totalRevenueUSD = new Gauge({
  name: 'warehouse_total_revenue_usd',
  help: 'Total revenue in USD',
  registers: [register],
});

export const revenueByWarehouse = new Gauge({
  name: 'warehouse_revenue_by_warehouse',
  help: 'Revenue by warehouse in USD',
  labelNames: ['warehouse_id', 'city'],
  registers: [register],
});

// Business Metrics - Users
export const activeUsers = new Gauge({
  name: 'warehouse_active_users',
  help: 'Number of active users',
  labelNames: ['user_type'],
  registers: [register],
});

export const userRegistrations = new Counter({
  name: 'warehouse_user_registrations_total',
  help: 'Total number of user registrations',
  labelNames: ['user_type'],
  registers: [register],
});

export const userLogins = new Counter({
  name: 'warehouse_user_logins_total',
  help: 'Total number of user logins',
  labelNames: ['user_type', 'auth_method'],
  registers: [register],
});

// Business Metrics - Inventory
export const inventoryTurnoverRate = new Gauge({
  name: 'warehouse_inventory_turnover_rate',
  help: 'Inventory turnover rate by warehouse',
  labelNames: ['warehouse_id', 'city'],
  registers: [register],
});

export const inventoryLevels = new Gauge({
  name: 'warehouse_inventory_levels',
  help: 'Current inventory levels',
  labelNames: ['warehouse_id', 'product_category'],
  registers: [register],
});

// Performance Metrics
export const databaseQueryDuration = new Histogram({
  name: 'warehouse_database_query_duration_seconds',
  help: 'Database query duration',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const cacheHitRate = new Gauge({
  name: 'warehouse_cache_hit_rate',
  help: 'Cache hit rate',
  labelNames: ['cache_type'],
  registers: [register],
});

export const apiCallDuration = new Histogram({
  name: 'warehouse_external_api_duration_seconds',
  help: 'External API call duration',
  labelNames: ['api_name', 'endpoint'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Search Metrics
export const searchQueries = new Counter({
  name: 'warehouse_search_queries_total',
  help: 'Total number of search queries',
  labelNames: ['search_type', 'has_results'],
  registers: [register],
});

export const searchLatency = new Histogram({
  name: 'warehouse_search_latency_seconds',
  help: 'Search query latency',
  labelNames: ['search_type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

// Helper function to track HTTP requests
export function trackHttpRequest(
  method: string,
  path: string,
  status: number,
  duration: number
) {
  httpRequestsTotal.labels(method, path, status.toString()).inc();
  httpRequestDuration.labels(method, path, status.toString()).observe(duration);
  
  if (status >= 400) {
    const errorType = status >= 500 ? 'server_error' : 'client_error';
    httpErrorsTotal.labels(method, path, status.toString(), errorType).inc();
  }
}

// Helper function to update warehouse metrics
export function updateWarehouseMetrics(warehouses: any[]) {
  totalWarehouses.set(warehouses.length);
  
  warehouses.forEach((warehouse) => {
    warehouseStatus
      .labels(warehouse.id, warehouse.status, warehouse.city, warehouse.state)
      .set(1);
    
    if (warehouse.utilization) {
      warehouseStorageUtilization
        .labels(warehouse.id, warehouse.city)
        .set(warehouse.utilization);
    }
    
    if (warehouse.turnoverRate) {
      inventoryTurnoverRate
        .labels(warehouse.id, warehouse.city)
        .set(warehouse.turnoverRate);
    }
  });
}

// Helper function to track order metrics
export function trackOrder(action: 'created' | 'completed' | 'cancelled', order: any) {
  switch (action) {
    case 'created':
      ordersCreatedTotal
        .labels(order.warehouseId, order.type)
        .inc();
      break;
    case 'completed':
      ordersCompletedTotal
        .labels(order.warehouseId, order.type)
        .inc();
      if (order.processingTime) {
        orderProcessingTime
          .labels(order.warehouseId, order.type)
          .observe(order.processingTime);
      }
      break;
    case 'cancelled':
      ordersCancelledTotal
        .labels(order.warehouseId, order.type, order.cancellationReason || 'unknown')
        .inc();
      break;
  }
}

// Helper function to track revenue
export function updateRevenueMetrics(totalRevenue: number, warehouseRevenue: Map<string, number>) {
  totalRevenueUSD.set(totalRevenue);
  
  warehouseRevenue.forEach((revenue, warehouseId) => {
    revenueByWarehouse
      .labels(warehouseId, 'unknown') // You might want to include city info
      .set(revenue);
  });
}

// Helper function to track user metrics
export function trackUserActivity(
  action: 'registration' | 'login',
  userType: string,
  authMethod?: string
) {
  switch (action) {
    case 'registration':
      userRegistrations.labels(userType).inc();
      break;
    case 'login':
      userLogins.labels(userType, authMethod || 'password').inc();
      break;
  }
}

// Helper function to track database queries
export function trackDatabaseQuery(
  operation: string,
  table: string,
  duration: number
) {
  databaseQueryDuration.labels(operation, table).observe(duration);
}

// Helper function to track cache operations
export function updateCacheMetrics(cacheType: string, hitRate: number) {
  cacheHitRate.labels(cacheType).set(hitRate);
}

// Helper function to track API calls
export function trackApiCall(
  apiName: string,
  endpoint: string,
  duration: number
) {
  apiCallDuration.labels(apiName, endpoint).observe(duration);
}

// Helper function to track search operations
export function trackSearch(
  searchType: string,
  hasResults: boolean,
  duration: number
) {
  searchQueries.labels(searchType, hasResults.toString()).inc();
  searchLatency.labels(searchType).observe(duration);
}

// Export the Prometheus register for the metrics endpoint
export { register };