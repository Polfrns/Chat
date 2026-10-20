import type { Model } from 'mongoose';
import { isValidObjectIdString } from '~/utils/objectId';
import type { IChatSession, IChatSessionDocument } from '~/types';

export type CreateChatSessionInput = {
  name: string;
  filestoreUids?: string[];
};

export type UpdateChatSessionInput = Partial<Pick<IChatSession, 'name' | 'filestoreUids'>>;

export interface ChatSessionMethods {
  createChatSession(owner: string, input: CreateChatSessionInput): Promise<IChatSession>;
  getChatSession(owner: string, sessionId: string): Promise<IChatSession | null>;
  listChatSessions(owner: string, options?: { search?: string }): Promise<IChatSession[]>;
  updateChatSession(
    owner: string,
    sessionId: string,
    input: UpdateChatSessionInput,
  ): Promise<IChatSession | null>;
  deleteChatSession(owner: string, sessionId: string): Promise<{ deletedCount: number }>;
  /** Add/remove a filestore on a session (idempotent), scoped to the owner. */
  setSessionFilestore(
    owner: string,
    sessionId: string,
    filestoreUid: string,
    attached: boolean,
  ): Promise<IChatSession | null>;
  /** Detach a filestore from every session referencing it (any owner). */
  detachFilestoreFromSessions(filestoreUid: string): Promise<{ modifiedCount: number }>;
}

export function createChatSessionMethods(mongoose: typeof import('mongoose')): ChatSessionMethods {
  const model = () => mongoose.models.ChatSession as Model<IChatSessionDocument>;

  /** filestoreUids are opaque Roko ids (UUIDs), not Mongo ObjectIds — keep any
   *  non-empty string. Accessibility is validated upstream (via the Roko service). */
  const cleanFilestoreUids = (ids: string[]): string[] =>
    ids.filter((id) => typeof id === 'string' && id.trim().length > 0);

  async function createChatSession(
    owner: string,
    input: CreateChatSessionInput,
  ): Promise<IChatSession> {
    const doc = await model().create({
      name: input.name.trim().slice(0, 150),
      owner,
      filestoreUids: cleanFilestoreUids(input.filestoreUids ?? []),
    });
    return doc.toObject();
  }

  async function getChatSession(owner: string, sessionId: string): Promise<IChatSession | null> {
    if (!isValidObjectIdString(sessionId)) {
      return null;
    }
    return model().findOne({ _id: sessionId, owner }).lean<IChatSession>();
  }

  async function listChatSessions(
    owner: string,
    options: { search?: string } = {},
  ): Promise<IChatSession[]> {
    const filter: Record<string, unknown> = { owner };
    if (options.search?.trim()) {
      filter.name = { $regex: options.search.trim(), $options: 'i' };
    }
    return model().find(filter).sort({ updatedAt: -1 }).lean<IChatSession[]>();
  }

  async function updateChatSession(
    owner: string,
    sessionId: string,
    input: UpdateChatSessionInput,
  ): Promise<IChatSession | null> {
    if (!isValidObjectIdString(sessionId)) {
      return null;
    }
    const update: UpdateChatSessionInput = {};
    if (input.name !== undefined) {
      update.name = input.name.trim().slice(0, 150);
    }
    if (input.filestoreUids !== undefined) {
      update.filestoreUids = cleanFilestoreUids(input.filestoreUids);
    }
    return model()
      .findOneAndUpdate({ _id: sessionId, owner }, { $set: update }, { new: true })
      .lean<IChatSession>();
  }

  async function deleteChatSession(
    owner: string,
    sessionId: string,
  ): Promise<{ deletedCount: number }> {
    if (!isValidObjectIdString(sessionId)) {
      return { deletedCount: 0 };
    }
    const res = await model().deleteOne({ _id: sessionId, owner });
    return { deletedCount: res.deletedCount ?? 0 };
  }

  async function setSessionFilestore(
    owner: string,
    sessionId: string,
    filestoreUid: string,
    attached: boolean,
  ): Promise<IChatSession | null> {
    if (!isValidObjectIdString(sessionId) || !filestoreUid) {
      return null;
    }
    const op = attached
      ? { $addToSet: { filestoreUids: filestoreUid } }
      : { $pull: { filestoreUids: filestoreUid } };
    return model()
      .findOneAndUpdate({ _id: sessionId, owner }, op, { new: true })
      .lean<IChatSession>();
  }

  /** Detach a filestore from every session referencing it (any owner) — cleanup
   *  after the store is deleted on the filestore service, so its uid can't
   *  silently reattach if a new store is later created under the same slug. */
  async function detachFilestoreFromSessions(
    filestoreUid: string,
  ): Promise<{ modifiedCount: number }> {
    if (!filestoreUid) {
      return { modifiedCount: 0 };
    }
    const res = await model().updateMany(
      { filestoreUids: filestoreUid },
      { $pull: { filestoreUids: filestoreUid } },
    );
    return { modifiedCount: res.modifiedCount ?? 0 };
  }

  return {
    createChatSession,
    getChatSession,
    listChatSessions,
    updateChatSession,
    deleteChatSession,
    setSessionFilestore,
    detachFilestoreFromSessions,
  };
}
