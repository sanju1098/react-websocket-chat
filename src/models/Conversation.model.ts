import { Schema, model, Document, Types } from 'mongoose';

export type ConversationType = '1:1' | 'group';

export interface IConversation extends Document {
  _id: Types.ObjectId;
  type: ConversationType;
  name?: string;
  members: Types.ObjectId[];
  lastMessage?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      enum: ['1:1', 'group'],
      required: true,
    },
    name: {
      type: String,
      trim: true,
    },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
  },
  { timestamps: true }
);

conversationSchema.index({ members: 1 });

export default model<IConversation>('Conversation', conversationSchema);
