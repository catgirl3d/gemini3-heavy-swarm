import React, { FC } from 'react';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { BaseModal } from '@/components/BaseModal';

export const WorkModal: FC<{
  title: string;
  content: string;
  onClose: () => void;
}> = ({ title, content, onClose }) => {
  return (
    <BaseModal isOpen={true} onClose={onClose} size="xl">
      <BaseModal.Header title={title} onClose={onClose} />
      <BaseModal.Body>
        <MarkdownRenderer content={content} />
      </BaseModal.Body>
    </BaseModal>
  );
};
