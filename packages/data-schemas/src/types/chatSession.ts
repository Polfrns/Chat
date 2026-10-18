import type { Document, Types } from 'mongoose';

export interface IChatSession {
  _id?: Types.ObjectId;
  name: string;
  owner: string;
  filestoreUids: string[];
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface IChatSessionDocument extends Omit<IChatSession, '_id'>, Document {}
