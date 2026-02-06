
export enum DocStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED'
}

export enum FieldType {
  SIGNATURE = 'SIGNATURE',
  NAME = 'NAME',
  TITLE = 'TITLE',
  DATE_SIGNED = 'DATE_SIGNED',
  TEXT = 'TEXT'
}

export interface DocField {
  id: string;
  type: FieldType;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  recipientId: string; // The ID of the recipient assigned to this field
  value?: string;
  signedAt?: string;
}

export interface Recipient {
  id: string;
  name: string;
  email: string;
  order: number; // Signing order (1, 2, 3...)
  completed: boolean;
}

export interface Envelope {
  id: string;
  name: string;
  status: DocStatus;
  created_at: string;
  recipients: Recipient[];
  current_order: number; // The current order index allowed to sign (starting at 1)
  document_url: string; // Master Plate URL
  fields: DocField[];
  archive_url?: string;
}

export interface User {
  email: string;
  name: string;
  role: 'ADMIN' | 'RECIPIENT';
}
