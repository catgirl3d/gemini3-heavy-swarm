import { type Message, type Source, type Work } from '@/types';
import { getSynthesisSources, getSynthesisText } from '@/utils/swarm/workHelpers';

// Model rows prefer the live session snapshot while generation is active,
// but historical rows must keep rendering from the persisted message snapshot.
export const getMessageDisplayWork = (message: Message, liveWork?: Work): Work | undefined => {
  if (message.role !== 'model') {
    return undefined;
  }

  return liveWork ?? message.work;
};

export const getMessageDisplayText = (message: Message, liveWork?: Work): string => {
  if (message.role === 'user') {
    return message.parts[0]?.text ?? '';
  }

  return getSynthesisText(getMessageDisplayWork(message, liveWork));
};

export const getMessageDisplaySources = (message: Message, liveWork?: Work): Source[] | undefined => {
  if (message.role === 'user') {
    return undefined;
  }

  return getSynthesisSources(getMessageDisplayWork(message, liveWork));
};

export const getHistoryParts = (message: Message): { text: string }[] => {
  if (message.role === 'user') {
    return message.parts;
  }

  return [{ text: getSynthesisText(message.work) }];
};
