# Inventory Management System - System Architecture

## Overview
High-performance, scalable inventory management system designed for warehouse operations with real-time capabilities, multi-warehouse support, and specialized ebike company features.

## Architecture Principles

### 1. Microservices Architecture
- **Service decomposition** by business domain
- **API-first design** with OpenAPI specifications
- **Event-driven communication** between services
- **Independent deployment** and scaling
- **Fault tolerance** and circuit breaker patterns

### 2. Event-Driven Design
- **Event sourcing** for complete audit trail
- **CQRS pattern** for read/write optimization
- **Real-time event streaming** via Apache Kafka
- **Eventual consistency** with compensation patterns
- **Event replay** for system recovery

### 3. Multi-Tenant Architecture
- **Tenant isolation** at application and data level
- **Shared infrastructure** with tenant-specific customization
- **Role-based access control** (RBAC) per tenant
- **Performance isolation** to prevent tenant interference
- **Compliance segregation** for different regulatory requirements

## System Components

### Core Services

#### 1. Inventory Service
```typescript
// Core inventory operations
interface InventoryService {
  // Stock management
  getStockLevel(sku: string, warehouse: string): Promise<StockLevel>
  updateStock(movement: StockMovement): Promise<void>
  reserveStock(reservation: StockReservation): Promise<void>

  // Real-time tracking
  subscribeToStockChanges(sku: string): Observable<StockChange>
  getStockMovements(filters: MovementFilters): Promise<Movement[]>

  // Multi-warehouse
  transferStock(transfer: InterWarehouseTransfer): Promise<void>
  allocateInventory(allocation: AllocationRequest): Promise<Allocation>
}

// Data models
interface StockLevel {
  sku: string
  warehouse: string
  location: string
  onHand: number
  reserved: number
  available: number
  inTransit: number
  lastUpdated: Date
}

interface StockMovement {
  id: string
  type: 'RECEIPT' | 'SHIPMENT' | 'ADJUSTMENT' | 'TRANSFER'
  sku: string
  warehouse: string
  location: string
  quantity: number
  reason: string
  userId: string
  timestamp: Date
  batchNumber?: string
  serialNumber?: string
}
```

#### 2. SKU Management Service
```typescript
interface SKUService {
  // SKU lifecycle
  createSKU(sku: SKUDefinition): Promise<SKU>
  updateSKU(skuId: string, updates: Partial<SKU>): Promise<SKU>
  deactivateSKU(skuId: string): Promise<void>

  // Barcode management
  generateBarcode(skuId: string, format: BarcodeFormat): Promise<Barcode>
  validateBarcode(barcode: string): Promise<SKU | null>

  // Product hierarchy
  createCategory(category: CategoryDefinition): Promise<Category>
  linkSKUToCategory(skuId: string, categoryId: string): Promise<void>
}

interface SKU {
  id: string
  code: string
  name: string
  description: string
  category: Category
  attributes: ProductAttribute[]
  dimensions: PhysicalDimensions
  weight: number
  cost: number
  price: number
  barcode: Barcode[]
  active: boolean
  createdAt: Date
  updatedAt: Date
}
```

#### 3. Reorder Management Service
```typescript
interface ReorderService {
  // Reorder point calculation
  calculateReorderPoint(sku: string, warehouse: string): Promise<ReorderPoint>
  updateReorderRules(rules: ReorderRules): Promise<void>

  // Alert management
  checkReorderAlerts(): Promise<ReorderAlert[]>
  generatePurchaseOrder(alert: ReorderAlert): Promise<PurchaseOrder>

  // Supplier integration
  sendPOToSupplier(po: PurchaseOrder): Promise<void>
  trackPOStatus(poId: string): Promise<POStatus>
}

interface ReorderPoint {
  sku: string
  warehouse: string
  reorderLevel: number
  reorderQuantity: number
  leadTime: number
  safetyStock: number
  calculatedAt: Date
  lastUpdated: Date
}
```

#### 4. Forecasting Service
```typescript
interface ForecastingService {
  // Demand forecasting
  generateForecast(request: ForecastRequest): Promise<DemandForecast>
  trainModel(data: HistoricalData): Promise<ModelMetrics>

  // Seasonal analysis
  analyzeSeasonal(sku: string, period: TimePeriod): Promise<SeasonalPattern>
  getSeasonalAdjustment(date: Date): Promise<number>

  // External factors
  integrateWeatherData(location: string): Promise<void>
  integrateEconomicIndicators(): Promise<void>
}

interface DemandForecast {
  sku: string
  warehouse: string
  forecasts: ForecastPoint[]
  accuracy: number
  model: string
  generatedAt: Date
}
```

#### 5. Ebike Integration Service
```typescript
interface EbikeService {
  // Product management
  createBikeModel(model: BikeModel): Promise<BikeModel>
  linkCompatibleParts(bikeId: string, partIds: string[]): Promise<void>

  // Parts compatibility
  getCompatibleParts(bikeModel: string, partType: string): Promise<Part[]>
  validatePartCompatibility(bikeId: string, partId: string): Promise<boolean>

  // Service integration
  scheduleService(request: ServiceRequest): Promise<ServiceAppointment>
  trackWarranty(item: WarrantyItem): Promise<WarrantyStatus>
}
```

### Data Layer

#### 1. Primary Database (PostgreSQL)
```sql
-- Core inventory tables
CREATE TABLE warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    address JSONB NOT NULL,
    timezone VARCHAR(50) NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID REFERENCES warehouses(id),
    zone VARCHAR(50),
    rack VARCHAR(50),
    bin VARCHAR(50),
    location_code VARCHAR(100) UNIQUE NOT NULL,
    capacity DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE skus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES categories(id),
    dimensions JSONB, -- {length, width, height, weight}
    cost DECIMAL(10,2),
    price DECIMAL(10,2),
    attributes JSONB, -- Flexible product attributes
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE inventory_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id UUID REFERENCES skus(id),
    warehouse_id UUID REFERENCES warehouses(id),
    location_id UUID REFERENCES locations(id),
    on_hand INTEGER DEFAULT 0,
    reserved INTEGER DEFAULT 0,
    in_transit INTEGER DEFAULT 0,
    last_counted_at TIMESTAMP,
    last_updated TIMESTAMP DEFAULT NOW(),
    UNIQUE(sku_id, warehouse_id, location_id)
);

CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_type VARCHAR(20) NOT NULL, -- RECEIPT, SHIPMENT, ADJUSTMENT, TRANSFER
    sku_id UUID REFERENCES skus(id),
    from_warehouse_id UUID REFERENCES warehouses(id),
    to_warehouse_id UUID REFERENCES warehouses(id),
    from_location_id UUID REFERENCES locations(id),
    to_location_id UUID REFERENCES locations(id),
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(10,2),
    reason TEXT,
    user_id UUID NOT NULL,
    batch_number VARCHAR(100),
    serial_numbers TEXT[],
    created_at TIMESTAMP DEFAULT NOW()
);

-- Reorder management
CREATE TABLE reorder_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id UUID REFERENCES skus(id),
    warehouse_id UUID REFERENCES warehouses(id),
    reorder_level INTEGER NOT NULL,
    reorder_quantity INTEGER NOT NULL,
    lead_time_days INTEGER DEFAULT 7,
    safety_stock INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(sku_id, warehouse_id)
);

-- Ebike specific tables
CREATE TABLE bike_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    manufacturer VARCHAR(255),
    model_year INTEGER,
    category VARCHAR(100), -- mountain, road, electric, etc.
    specifications JSONB,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE part_compatibility (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bike_model_id UUID REFERENCES bike_models(id),
    part_sku_id UUID REFERENCES skus(id),
    compatibility_type VARCHAR(50), -- COMPATIBLE, RECOMMENDED, OPTIONAL
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(bike_model_id, part_sku_id)
);
```

#### 2. Time-Series Database (InfluxDB)
```typescript
// Real-time metrics storage
interface InventoryMetrics {
  measurement: 'inventory_levels'
  tags: {
    sku: string
    warehouse: string
    location: string
  }
  fields: {
    on_hand: number
    reserved: number
    available: number
    velocity: number // items moved per hour
  }
  timestamp: Date
}

interface MovementMetrics {
  measurement: 'stock_movements'
  tags: {
    movement_type: string
    warehouse: string
    user: string
  }
  fields: {
    quantity: number
    value: number
    processing_time: number
  }
  timestamp: Date
}
```

#### 3. Cache Layer (Redis)
```typescript
// Hot data caching
interface CacheStrategy {
  // Frequently accessed inventory levels
  stockLevels: {
    key: `stock:${sku}:${warehouse}`
    ttl: 300 // 5 minutes
    data: StockLevel
  }

  // Barcode lookups
  barcodes: {
    key: `barcode:${barcodeValue}`
    ttl: 3600 // 1 hour
    data: SKU
  }

  // User sessions
  sessions: {
    key: `session:${sessionId}`
    ttl: 1800 // 30 minutes
    data: UserSession
  }
}
```

### API Design

#### 1. RESTful APIs
```typescript
// Inventory API endpoints
const inventoryAPI = {
  // Stock levels
  'GET /api/v1/inventory/{sku}': 'Get stock levels across warehouses',
  'GET /api/v1/inventory/{sku}/movements': 'Get movement history',
  'POST /api/v1/inventory/movements': 'Record stock movement',
  'POST /api/v1/inventory/adjustments': 'Make inventory adjustment',

  // Transfers
  'POST /api/v1/inventory/transfers': 'Initiate warehouse transfer',
  'PUT /api/v1/inventory/transfers/{id}/status': 'Update transfer status',

  // Reservations
  'POST /api/v1/inventory/reservations': 'Reserve inventory',
  'DELETE /api/v1/inventory/reservations/{id}': 'Release reservation',

  // Real-time subscriptions
  'GET /api/v1/inventory/{sku}/stream': 'WebSocket for real-time updates'
}

// SKU Management API
const skuAPI = {
  'GET /api/v1/skus': 'List SKUs with pagination',
  'POST /api/v1/skus': 'Create new SKU',
  'GET /api/v1/skus/{id}': 'Get SKU details',
  'PUT /api/v1/skus/{id}': 'Update SKU',
  'DELETE /api/v1/skus/{id}': 'Deactivate SKU',
  'POST /api/v1/skus/{id}/barcodes': 'Generate barcode',
  'GET /api/v1/barcodes/{code}/sku': 'Lookup SKU by barcode'
}
```

#### 2. GraphQL API
```graphql
type Query {
  inventory(sku: String!, warehouse: String): InventoryLevel
  inventoryByLocation(warehouse: String!, location: String!): [InventoryLevel]
  skuDetails(sku: String!): SKU
  demandForecast(sku: String!, days: Int!): DemandForecast
  reorderAlerts(warehouse: String): [ReorderAlert]
  compatibleParts(bikeModel: String!, partType: String!): [Part]
}

type Mutation {
  recordMovement(movement: StockMovementInput!): StockMovement
  adjustInventory(adjustment: InventoryAdjustmentInput!): Boolean
  createSKU(sku: SKUInput!): SKU
  updateReorderRule(rule: ReorderRuleInput!): ReorderRule
}

type Subscription {
  stockLevelUpdated(sku: String!): InventoryLevel
  movementRecorded(warehouse: String!): StockMovement
  reorderAlert: ReorderAlert
}
```

### Real-Time Architecture

#### 1. Event Streaming (Apache Kafka)
```typescript
// Kafka topics
const topics = {
  'inventory.stock.updated': {
    schema: StockUpdateEvent,
    partitions: 10,
    replicationFactor: 3
  },
  'inventory.movement.recorded': {
    schema: MovementEvent,
    partitions: 5,
    replicationFactor: 3
  },
  'reorder.alert.triggered': {
    schema: ReorderAlertEvent,
    partitions: 3,
    replicationFactor: 3
  }
}

// Event schemas
interface StockUpdateEvent {
  eventId: string
  timestamp: Date
  sku: string
  warehouse: string
  previousLevel: number
  newLevel: number
  changeReason: string
  userId: string
}
```

#### 2. WebSocket Connections
```typescript
// Real-time client updates
class InventoryWebSocketService {
  subscribeToSKU(sku: string, callback: (update: StockUpdate) => void): void
  subscribeToWarehouse(warehouse: string, callback: (movement: Movement) => void): void
  subscribeToAlerts(userId: string, callback: (alert: Alert) => void): void
}
```

### Integration Architecture

#### 1. Barcode Scanner Integration
```typescript
interface ScannerIntegration {
  // Hardware integration
  connectToScanner(deviceId: string): Promise<ScannerConnection>
  configureScannerSettings(settings: ScannerSettings): Promise<void>

  // Mobile app integration
  processMobileScan(scanData: MobileScanData): Promise<ScanResult>
  validateScanFormat(barcode: string): boolean
}

// Scanner webhook endpoint
app.post('/api/v1/webhooks/scanner', async (req, res) => {
  const scanEvent = req.body as ScannerWebhookEvent
  await processScanEvent(scanEvent)
  res.status(200).json({ received: true })
})
```

#### 2. ERP Integration
```typescript
interface ERPIntegration {
  // SAP integration
  syncWithSAP(): Promise<SyncResult>
  pushInventoryToSAP(data: InventoryData): Promise<void>
  pullOrdersFromSAP(): Promise<SalesOrder[]>

  // NetSuite integration
  syncWithNetSuite(): Promise<SyncResult>
  pushStockMovements(movements: Movement[]): Promise<void>
}
```

### Security Architecture

#### 1. Authentication & Authorization
```typescript
interface SecurityService {
  // JWT-based authentication
  authenticate(credentials: LoginCredentials): Promise<AuthToken>
  validateToken(token: string): Promise<UserClaims>
  refreshToken(refreshToken: string): Promise<AuthToken>

  // Role-based access control
  checkPermission(userId: string, resource: string, action: string): Promise<boolean>
  getUserPermissions(userId: string): Promise<Permission[]>
}

// Permission matrix
const permissions = {
  'inventory.read': ['viewer', 'operator', 'manager', 'admin'],
  'inventory.write': ['operator', 'manager', 'admin'],
  'inventory.adjust': ['manager', 'admin'],
  'reorder.manage': ['manager', 'admin'],
  'reports.view': ['viewer', 'operator', 'manager', 'admin'],
  'system.admin': ['admin']
}
```

#### 2. Audit Logging
```typescript
interface AuditService {
  logAction(action: AuditAction): Promise<void>
  getAuditTrail(filters: AuditFilters): Promise<AuditEntry[]>
  exportAuditData(dateRange: DateRange): Promise<AuditExport>
}

interface AuditAction {
  userId: string
  action: string
  resource: string
  resourceId: string
  changes: Record<string, any>
  timestamp: Date
  ipAddress: string
  userAgent: string
}
```

### Deployment Architecture

#### 1. Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: inventory-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: inventory-service
  template:
    metadata:
      labels:
        app: inventory-service
    spec:
      containers:
      - name: inventory-service
        image: gcr.io/warehouse-network/inventory-service:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

#### 2. Service Mesh (Istio)
```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: inventory-service
spec:
  http:
  - match:
    - uri:
        prefix: "/api/v1/inventory"
    route:
    - destination:
        host: inventory-service
        port:
          number: 3000
    timeout: 30s
    retries:
      attempts: 3
      perTryTimeout: 10s
```

### Performance Optimization

#### 1. Caching Strategy
- **L1 Cache**: Application-level caching with Redis
- **L2 Cache**: Database query result caching
- **CDN**: Static asset caching for frontend
- **Edge Caching**: API response caching at edge locations

#### 2. Database Optimization
- **Read Replicas**: For reporting and analytics queries
- **Partitioning**: Time-based partitioning for movement history
- **Indexing Strategy**: Optimized indexes for common query patterns
- **Connection Pooling**: Efficient database connection management

#### 3. Horizontal Scaling
- **Stateless Services**: All services designed for horizontal scaling
- **Load Balancing**: Intelligent request routing
- **Auto-scaling**: Kubernetes HPA based on CPU/memory/custom metrics
- **Database Sharding**: Tenant-based sharding for very large deployments

This architecture provides a robust, scalable foundation for the comprehensive inventory management system while ensuring high performance, security, and maintainability.