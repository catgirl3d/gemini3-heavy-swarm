import { type Message, type Source, type Work } from '@/types';
import { getSynthesisSources, getSynthesisText } from '@/utils/swarm/workHelpers';

const getModelProjectionWork = (message: Message, liveWork?: Work): Work | undefined => {
  return liveWork ?? message.work;
};

export const getMessageDisplayText = (message: Message, liveWork?: Work): string => {
  if (message.role === 'user') {
    return message.parts[0]?.text ?? '';
  }

  return getSynthesisText(getModelProjectionWork(message, liveWork));
};

export const getMessageDisplaySources = (message: Message, liveWork?: Work): Source[] | undefined => {
  if (message.role === 'user') {
    return undefined;
  }

  return getSynthesisSources(getModelProjectionWork(message, liveWork));
};

export const getHistoryParts = (message: Message): { text: string }[] => {
  if (message.role === 'user') {
    return message.parts;
  }

  return [{ text: getSynthesisText(message.work) }];
};
