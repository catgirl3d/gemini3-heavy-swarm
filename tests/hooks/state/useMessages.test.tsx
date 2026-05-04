import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Message } from '@/types';
import { useMessages } from '@/hooks/state/useMessages';

const createMessage = (id: string, text: string): Message => ({
  id,
  role: 'user',
  parts: [{ text }],
});

describe('useMessages', () => {
  it('starts with empty messages and a synced ref', () => {
    const { result } = renderHook(() => useMessages());

    expect(result.current.messages).toEqual([]);
    expect(result.current.messagesRef.current).toBe(result.current.messages);
  });

  it('updates messages and keeps messagesRef synced', () => {
    const { result } = renderHook(() => useMessages());
    const messages = [createMessage('m1', 'hello')];

    act(() => {
      result.current.setMessages(messages);
    });

    expect(result.current.messages).toBe(messages);
    expect(result.current.messagesRef.current).toBe(messages);
  });

  it('supports functional updates and syncs the ref to the latest state', () => {
    const { result } = renderHook(() => useMessages());
    const firstMessage = createMessage('m1', 'hello');
    const secondMessage = createMessage('m2', 'world');

    act(() => {
      result.current.setMessages([firstMessage]);
    });

    act(() => {
      result.current.setMessages((previous) => [...previous, secondMessage]);
    });

    expect(result.current.messages).toEqual([firstMessage, secondMessage]);
    expect(result.current.messagesRef.current).toEqual([firstMessage, secondMessage]);
    expect(result.current.messagesRef.current).toBe(result.current.messages);
  });
});
