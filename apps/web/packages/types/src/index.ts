export interface Warehouse {
  id: string;
  name: string;
}

export interface Inventory {
  id: string;
  warehouseId: string;
}

export interface User {
  id: string;
  email: string;
}
