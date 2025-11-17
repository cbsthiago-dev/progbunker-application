export enum ProductType {
  VLSFO = 'VLSFO',
  MGO = 'MGO',
}

export enum RequestStatus {
  InProgress = 'Em Atendimento',
  Confirmed = 'A Confirmar',
}

export interface Location {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface ProductDetail {
  productType: ProductType;
  quantity: number;
}

export interface BargeProduct {
  productType: ProductType;
  capacity: number;
}

export interface BargeVolume {
  productType: ProductType;
  volume: number;
}

export interface Barge {
  id: string;
  name: string;
  products: BargeProduct[];
  speed: number; // in knots
}

export interface BargeState {
  bargeId: string;
  volumes: BargeVolume[];
  locationId: string;
}

export interface RefuelingRequest {
  id:string;
  shipName: string;
  products: ProductDetail[];
  windowStart: string;
  windowEnd: string;
  contractualDate: string;
  status: RequestStatus;
  locationId: string;
}

export interface ScheduleItem {
  shipName: string;
  bargeName: string;
  scheduledTime: string;
  product: ProductType;
  quantity: number;
  locationName: string;
}

export interface OperationHistoryItem {
  id: string;
  shipName: string;
  bargeName: string;
  completionTime: string;
  product: ProductType;
  quantity: number;
}

export interface Priority {
  id: string;
  text: string;
}