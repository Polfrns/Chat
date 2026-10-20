import { Schema } from 'mongoose';
import type { IChatSessionDocument } from '~/types';

/**
 * A Roko Session — a first-class container that groups chats (1→many via
 * `conversation.sessionId`) and attaches Filestores (M2M via `filestoreUids`).
 * Model name `ChatSession` because `Session` is taken by the auth refresh-token
 * session; the API/UI surface it simply as "session".
 */
const chatSessionSchema: Schema<IChatSessionDocument> = new Schema<IChatSessionDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
      index: true,
    },
    owner: {
      type: String,
      required: true,
      index: true,
    },
    /** Attached Filestore ids (M2M). Order preserved for display. */
    filestoreUids: {
      type: [String],
      default: [],
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

chatSessionSchema.index({ owner: 1, updatedAt: -1 });

export default chatSessionSchema;
