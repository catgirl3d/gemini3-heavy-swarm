import { useState, useEffect, useRef } from 'react';

export function useAutoScroll(deps: {
  messagesLength: number;
  isLoading: boolean;
  error: string | null;
}) {
  const messageListRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Smart Auto-scroll Logic
  useEffect(() => {
    const element = messageListRef.current;
    if (!element) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShouldAutoScroll(isNearBottom);
      
      const hasScrollableContent = scrollHeight > clientHeight;
      setShowScrollButton(!isNearBottom && hasScrollableContent);
    };

    element.addEventListener('scroll', handleScroll);
    return () => element.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle auto-scroll for new messages or errors
  useEffect(() => {
    const element = messageListRef.current;
    if (!element) return;

    if (shouldAutoScroll) {
      element.scrollTop = element.scrollHeight;
    }
  }, [deps.messagesLength, deps.isLoading, shouldAutoScroll, deps.error]);

  // MutationObserver to handle streaming content updates without re-running the effect on every chunk
  useEffect(() => {
    const element = messageListRef.current;
    if (!element || !shouldAutoScroll) return;

    let lastHeight = element.scrollHeight;
    
    const observer = new MutationObserver(() => {
      const newHeight = element.scrollHeight;
      if (newHeight !== lastHeight) {
        element.scrollTop = newHeight;
        lastHeight = newHeight;
      }
    });

    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return () => observer.disconnect();
  }, [shouldAutoScroll]);

  const scrollToBottom = () => {
    if (messageListRef.current) {
      setShouldAutoScroll(true);
      setShowScrollButton(false);
      messageListRef.current.scrollTo({ top: messageListRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  return {
    messageListRef,
    shouldAutoScroll,
    setShouldAutoScroll,
    showScrollButton,
    scrollToBottom
  };
}
