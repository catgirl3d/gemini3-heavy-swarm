import { type Message } from '@/types';

export const isLatestRegenerableMessage = (messages: Message[], messageId: string): boolean => {
  const messageIndex = messages.findIndex(message => message.id === messageId);
  if (messageIndex === -1) {
    return false;
  }

  const targetMessage = messages[messageIndex];
  if (targetMessage?.role !== 'model') {
    return false;
  }

  return messageIndex === messages.length - 1;
};
