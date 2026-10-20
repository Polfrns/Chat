import { Model } from 'mongoose';
import type { IChatSessionDocument } from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import chatSessionSchema from '~/schema/chatSession';

export function createChatSessionModel(
  mongoose: typeof import('mongoose'),
): Model<IChatSessionDocument> {
  applyTenantIsolation(chatSessionSchema);
  return (
    mongoose.models.ChatSession ||
    mongoose.model<IChatSessionDocument>('ChatSession', chatSessionSchema, 'chatsessions')
  );
}
