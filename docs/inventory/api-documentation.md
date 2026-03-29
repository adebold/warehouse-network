# Inventory Management System - API Documentation

## Overview
The Inventory Management System provides comprehensive APIs for warehouse operations, including real-time inventory tracking, barcode scanning, automated reorders, forecasting, and ebike-specific functionality.

## Base URL
```
https://api.warehouse-network.com/v1/inventory
```

## Authentication
All API endpoints require authentication using Bearer tokens:
```http
Authorization: Bearer <your-access-token>
```

## API Endpoints

### Inventory Management

#### Get Stock Level
```http
GET /inventory/{sku}
```

**Parameters:**
- `sku` (required): SKU code to lookup
- `warehouse` (optional): Warehouse code filter
- `location` (optional): Location code filter

**Response:**
```json
{
  "sku": "BIKE-FRAME-001",
  "warehouse": "WH001",
  "location": "A1-01",
  "onHand": 100,
  "reserved": 10,
  "available": 90,
  "inTransit": 5,
  "lastUpdated": "2024-03-25T10:30:00Z"
}
```

#### Get All Stock Levels
```http
GET /inventory
```

**Query Parameters:**
- `sku` (optional): SKU code filter
- `warehouse` (optional): Warehouse code filter
- `location` (optional): Location code filter
- `category` (optional): Product category filter
- `lowStock` (optional): Filter for low stock items (boolean)
- `includeReserved` (optional): Include reserved quantities (default: true)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50, max: 200)

**Response:**
```json
{
  "data": [
    {
      "sku": "BIKE-FRAME-001",
      "warehouse": "WH001",
      "onHand": 100,
      "available": 90,
      "reserved": 10,
      "lastUpdated": "2024-03-25T10:30:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "totalPages": 1
}
```

#### Record Stock Movement
```http
POST /inventory/movements
```

**Request Body:**
```json
{
  "type": "RECEIPT",
  "sku": "BIKE-FRAME-001",
  "warehouse": "WH001",
  "location": "A1-01",
  "quantity": 50,
  "unitCost": 150.00,
  "reason": "Purchase order PO-12345",
  "batchNumber": "BATCH-001",
  "serialNumbers": ["SN001", "SN002"]
}
```

**Movement Types:**
- `RECEIPT` - Receiving inventory
- `SHIPMENT` - Shipping out inventory
- `ADJUSTMENT` - Manual adjustment
- `TRANSFER` - Inter-warehouse transfer
- `CYCLE_COUNT` - Physical count adjustment
- `RETURN` - Customer return
- `DAMAGE` - Damaged goods
- `EXPIRED` - Expired items

**Response:**
```json
{
  "id": "movement-123",
  "type": "RECEIPT",
  "sku": "BIKE-FRAME-001",
  "warehouse": "WH001",
  "quantity": 50,
  "timestamp": "2024-03-25T10:30:00Z",
  "userId": "user-123"
}
```

#### Get Movement History
```http
GET /inventory/{sku}/movements
```

**Query Parameters:**
- `warehouse` (optional): Warehouse filter
- `type` (optional): Movement type filter
- `userId` (optional): User filter
- `startDate` (optional): Start date filter (ISO 8601)
- `endDate` (optional): End date filter (ISO 8601)
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response:**
```json
{
  "data": [
    {
      "id": "movement-123",
      "type": "RECEIPT",
      "sku": "BIKE-FRAME-001",
      "quantity": 50,
      "timestamp": "2024-03-25T10:30:00Z",
      "reason": "Purchase order PO-12345"
    }
  ],
  "total": 1,
  "page": 1,
  "totalPages": 1
}
```

#### Reserve Stock
```http
POST /inventory/reservations
```

**Request Body:**
```json
{
  "sku": "BIKE-FRAME-001",
  "warehouse": "WH001",
  "location": "A1-01",
  "quantity": 5
}
```

**Response:**
```json
{
  "success": true,
  "message": "Stock reserved successfully",
  "reservationId": "res-123"
}
```

#### Release Reservation
```http
DELETE /inventory/reservations/{reservationId}
```

### SKU Management

#### Create SKU
```http
POST /skus
```

**Request Body:**
```json
{
  "skuCode": "BIKE-FRAME-001",
  "name": "Mountain Bike Frame - Large",
  "description": "Aluminum mountain bike frame, size large",
  "categoryId": "cat-123",
  "dimensions": {
    "length": 150,
    "width": 30,
    "height": 80,
    "weight": 2.5,
    "unit": "cm",
    "weightUnit": "kg"
  },
  "cost": 150.00,
  "price": 299.99,
  "attributes": {
    "material": "Aluminum",
    "size": "Large",
    "color": "Black"
  },
  "tags": ["bike", "frame", "mountain"]
}
```

**Response:**
```json
{
  "id": "sku-123",
  "skuCode": "BIKE-FRAME-001",
  "name": "Mountain Bike Frame - Large",
  "description": "Aluminum mountain bike frame, size large",
  "category": {
    "id": "cat-123",
    "name": "Bike Frames"
  },
  "barcodes": [
    {
      "id": "barcode-123",
      "code": "BIKEFRAME001123",
      "format": "CODE128",
      "primary": true
    }
  ],
  "active": true,
  "createdAt": "2024-03-25T10:30:00Z"
}
```

#### Get SKU Details
```http
GET /skus/{skuCode}
```

**Response:**
```json
{
  "id": "sku-123",
  "skuCode": "BIKE-FRAME-001",
  "name": "Mountain Bike Frame - Large",
  "category": {
    "id": "cat-123",
    "name": "Bike Frames"
  },
  "barcodes": [...],
  "inventoryLevels": [
    {
      "warehouse": {
        "code": "WH001",
        "name": "Main Warehouse"
      },
      "onHand": 100,
      "available": 90
    }
  ]
}
```

#### Update SKU
```http
PUT /skus/{skuCode}
```

#### Search SKUs
```http
GET /skus
```

**Query Parameters:**
- `search` (optional): Search term for name/description
- `category` (optional): Category filter
- `active` (optional): Active status filter
- `tags` (optional): Tags filter (comma-separated)
- `page` (optional): Page number
- `limit` (optional): Items per page

### Barcode Management

#### Generate Barcode
```http
POST /skus/{skuCode}/barcodes
```

**Request Body:**
```json
{
  "format": "CODE128"
}
```

**Barcode Formats:**
- `CODE128`
- `CODE39`
- `EAN13`
- `UPC_A`
- `QR_CODE`

#### Validate Barcode
```http
GET /barcodes/{barcodeCode}/sku
```

**Response:**
```json
{
  "sku": {
    "skuCode": "BIKE-FRAME-001",
    "name": "Mountain Bike Frame - Large",
    "category": "Bike Frames"
  },
  "barcode": {
    "code": "BIKEFRAME001123",
    "format": "CODE128",
    "primary": true
  }
}
```

#### Generate Barcode Image
```http
GET /barcodes/{barcodeCode}/image
```

**Query Parameters:**
- `format` (optional): Image format (svg, png) - default: svg
- `width` (optional): Image width in pixels
- `height` (optional): Image height in pixels

**Response:** Binary image data

#### Process Barcode Scan
```http
POST /scans
```

**Request Body:**
```json
{
  "barcodeCode": "BIKEFRAME001123",
  "warehouseId": "WH001",
  "locationId": "A1-01",
  "scanType": "RECEIVE",
  "quantity": 10,
  "metadata": {
    "scanner": "mobile-app",
    "deviceId": "scanner-001"
  }
}
```

**Scan Types:**
- `RECEIVE` - Receiving inventory
- `PICK` - Picking for shipment
- `COUNT` - Cycle counting
- `LOOKUP` - Information lookup
- `MOVE` - Moving between locations

**Response:**
```json
{
  "success": true,
  "sku": {
    "skuCode": "BIKE-FRAME-001",
    "name": "Mountain Bike Frame - Large"
  },
  "stockLevel": {
    "onHand": 110,
    "available": 100
  },
  "message": "Received 10 units of Mountain Bike Frame - Large",
  "scanEvent": {
    "id": "scan-123",
    "timestamp": "2024-03-25T10:30:00Z"
  }
}
```

#### Bulk Barcode Scanning
```http
POST /scans/bulk
```

**Request Body:**
```json
{
  "scans": [
    {
      "barcodeCode": "BIKEFRAME001123",
      "quantity": 5,
      "locationId": "A1-01"
    },
    {
      "barcodeCode": "BIKEFRAME002124",
      "quantity": 3,
      "locationId": "A1-02"
    }
  ],
  "warehouseId": "WH001",
  "scanType": "RECEIVE",
  "batchNumber": "BATCH-001"
}
```

### Reorder Management

#### Create Reorder Rule
```http
POST /reorder-rules
```

**Request Body:**
```json
{
  "skuId": "BIKE-FRAME-001",
  "warehouseId": "WH001",
  "reorderLevel": 25,
  "reorderQuantity": 100,
  "leadTimeDays": 14,
  "safetyStock": 10,
  "supplierId": "supplier-123"
}
```

#### Get Reorder Alerts
```http
GET /reorder-alerts
```

**Query Parameters:**
- `warehouse` (optional): Warehouse filter
- `status` (optional): Alert status filter

**Response:**
```json
{
  "data": [
    {
      "id": "alert-123",
      "skuId": "BIKE-FRAME-001",
      "warehouseId": "WH001",
      "currentLevel": 15,
      "reorderLevel": 25,
      "suggestedQuantity": 100,
      "status": "PENDING",
      "createdAt": "2024-03-25T10:30:00Z"
    }
  ]
}
```

#### Calculate Reorder Point
```http
GET /reorder-calculation/{sku}
```

**Query Parameters:**
- `warehouse` (optional): Warehouse code

**Response:**
```json
{
  "sku": "BIKE-FRAME-001",
  "warehouse": "WH001",
  "currentLevel": 15,
  "reorderLevel": 28,
  "reorderQuantity": 75,
  "leadTime": 14,
  "safetyStock": 12,
  "averageDemand": 1.2,
  "calculation": {
    "method": "statistical",
    "factors": {
      "averageDemand": 1.2,
      "leadTime": 14,
      "safetyStock": 12,
      "demandVariability": 0.3
    }
  }
}
```

### Demand Forecasting

#### Generate Forecast
```http
POST /forecasts
```

**Request Body:**
```json
{
  "sku": "BIKE-FRAME-001",
  "warehouse": "WH001",
  "startDate": "2024-04-01",
  "endDate": "2024-04-30",
  "includeSeasonality": true,
  "includeExternalFactors": false
}
```

**Response:**
```json
{
  "sku": "BIKE-FRAME-001",
  "warehouse": "WH001",
  "forecasts": [
    {
      "date": "2024-04-01",
      "predictedDemand": 5,
      "confidence": 0.85,
      "seasonalFactor": 1.1,
      "trendFactor": 0.02
    }
  ],
  "accuracy": 0.82,
  "model": "hybrid-exponential-smoothing",
  "generatedAt": "2024-03-25T10:30:00Z"
}
```

#### Get Forecast Accuracy
```http
GET /forecasts/{sku}/accuracy
```

**Query Parameters:**
- `warehouse` (optional): Warehouse filter
- `days` (optional): Number of days to analyze (default: 30)

### E-bike Management

#### Create Bike Model
```http
POST /ebikes/models
```

**Request Body:**
```json
{
  "modelCode": "TREK-EBIKE-2024",
  "name": "Trek PowerFly 5",
  "manufacturer": "Trek",
  "modelYear": 2024,
  "category": "electric-mountain",
  "specifications": {
    "general": {
      "weight": 23.5,
      "maxLoad": 136
    },
    "drivetrain": {
      "motor": {
        "type": "Bosch Performance Line CX",
        "power": 625,
        "torque": 85,
        "placement": "mid-drive"
      },
      "battery": {
        "capacity": 625,
        "voltage": 36,
        "chemistry": "Li-Ion",
        "range": 80
      }
    }
  }
}
```

#### Get Compatible Parts
```http
GET /ebikes/models/{modelCode}/parts
```

**Query Parameters:**
- `partCategory` (optional): Filter by part category
- `compatibilityType` (optional): Filter by compatibility type

**Response:**
```json
{
  "bikeModel": "TREK-EBIKE-2024",
  "compatibleParts": [
    {
      "partSku": "BOSCH-BATTERY-625",
      "partName": "Bosch PowerPack 625Wh",
      "category": "Battery",
      "compatibilityType": "RECOMMENDED",
      "fitmentNotes": "OEM battery for this model",
      "installationDifficulty": "medium"
    }
  ],
  "incompatibleParts": []
}
```

#### Validate Part Compatibility
```http
GET /ebikes/compatibility/{modelCode}/{partSku}
```

**Response:**
```json
{
  "compatible": true,
  "compatibilityType": "RECOMMENDED",
  "notes": "OEM battery for this model",
  "alternativeParts": []
}
```

#### Schedule Service
```http
POST /ebikes/service
```

**Request Body:**
```json
{
  "bikeModel": "TREK-EBIKE-2024",
  "serviceType": "maintenance",
  "partsNeeded": [
    {
      "partSku": "CHAIN-TOOL-001",
      "quantity": 1,
      "required": true
    }
  ],
  "scheduledDate": "2024-03-30T14:00:00Z",
  "priority": "medium",
  "customerInfo": {
    "id": "customer-123",
    "name": "John Doe",
    "contact": "john@example.com"
  }
}
```

### Reports and Analytics

#### Get Scan Statistics
```http
GET /analytics/scan-statistics
```

**Query Parameters:**
- `warehouseId` (optional): Warehouse filter
- `userId` (optional): User filter
- `startDate` (optional): Start date filter
- `endDate` (optional): End date filter

#### Generate Inventory Report
```http
POST /reports/inventory
```

**Request Body:**
```json
{
  "reportType": "STOCK_LEVELS",
  "parameters": {
    "warehouse": "WH001",
    "category": "Bike Frames",
    "includeZeroStock": false
  },
  "format": "json"
}
```

**Report Types:**
- `STOCK_LEVELS` - Current inventory levels
- `MOVEMENT_HISTORY` - Stock movement history
- `REORDER_ANALYSIS` - Reorder recommendations
- `FORECAST_ACCURACY` - Forecasting performance
- `INVENTORY_VALUATION` - Financial valuation
- `TURNOVER_ANALYSIS` - Inventory turnover metrics
- `DEAD_STOCK` - Non-moving inventory
- `ABC_ANALYSIS` - ABC classification analysis

## Error Handling

### Error Response Format
```json
{
  "error": {
    "code": "INVENTORY_001",
    "message": "Insufficient stock available",
    "details": {
      "sku": "BIKE-FRAME-001",
      "requested": 100,
      "available": 50
    },
    "timestamp": "2024-03-25T10:30:00Z"
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|---------|-------------|
| INVENTORY_001 | 409 | Insufficient stock |
| INVENTORY_002 | 404 | SKU not found |
| INVENTORY_003 | 404 | Warehouse not found |
| INVENTORY_004 | 400 | Invalid movement type |
| INVENTORY_005 | 400 | Invalid barcode format |
| INVENTORY_006 | 409 | SKU already exists |
| INVENTORY_007 | 400 | Invalid forecast parameters |
| INVENTORY_008 | 404 | Reorder rule not found |
| INVENTORY_009 | 404 | Bike model not found |
| INVENTORY_010 | 400 | Part compatibility error |

## Rate Limiting

API requests are rate-limited per user:
- **Standard users**: 1000 requests/hour
- **Premium users**: 5000 requests/hour
- **Enterprise users**: 10000 requests/hour

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## Webhooks

The system can send webhook notifications for key events:

### Event Types
- `inventory.stock.updated` - Stock level changes
- `inventory.movement.recorded` - New movement recorded
- `inventory.reorder.alert` - Reorder alert triggered
- `inventory.scan.processed` - Barcode scan processed
- `inventory.forecast.updated` - New forecast generated

### Webhook Payload
```json
{
  "eventType": "inventory.stock.updated",
  "timestamp": "2024-03-25T10:30:00Z",
  "data": {
    "sku": "BIKE-FRAME-001",
    "warehouse": "WH001",
    "previousLevel": 100,
    "newLevel": 95,
    "changeReason": "shipment"
  },
  "userId": "user-123"
}
```

## SDK Examples

### JavaScript/Node.js
```javascript
const InventoryAPI = require('@warehouse-network/inventory-sdk');

const client = new InventoryAPI({
  apiKey: 'your-api-key',
  baseURL: 'https://api.warehouse-network.com/v1/inventory'
});

// Get stock level
const stockLevel = await client.inventory.getStockLevel('BIKE-FRAME-001', 'WH001');

// Record movement
const movement = await client.inventory.recordMovement({
  type: 'RECEIPT',
  sku: 'BIKE-FRAME-001',
  warehouse: 'WH001',
  quantity: 50
});
```

### Python
```python
from warehouse_network import InventoryClient

client = InventoryClient(api_key='your-api-key')

# Get stock level
stock_level = client.inventory.get_stock_level('BIKE-FRAME-001', 'WH001')

# Process barcode scan
scan_result = client.barcodes.process_scan({
    'barcode_code': 'BIKEFRAME001123',
    'warehouse_id': 'WH001',
    'scan_type': 'RECEIVE',
    'quantity': 10
})
```

## Testing

### Test Environment
- **Base URL**: `https://api-staging.warehouse-network.com/v1/inventory`
- **Test API Key**: Contact support for test credentials

### Mock Data
The test environment includes pre-populated mock data:
- 100+ sample SKUs
- 5 warehouses
- Historical movement data
- Sample bike models and parts

For detailed testing scenarios and sample payloads, see the [Testing Guide](./testing-guide.md).