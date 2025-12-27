import React, { FC } from 'react';
import { BaseModal } from '@/components/modals/BaseModal';
import './InfoModal.css';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InfoModal: FC<InfoModalProps> = ({ isOpen, onClose }) => {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
    >
      <BaseModal.Header title="How it Works" onClose={onClose} />
      
      <BaseModal.Body>
        <div className="info-section">
          <div className="info-step">
            <div className="info-icon-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <div className="info-content">
              <h4>1. Initial Drafts</h4>
              <p>Multiple AI agents independently analyze your request and generate diverse initial drafts. This ensures a wide range of perspectives and creative approaches.</p>
            </div>
          </div>

          <div className="info-arrow">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <polyline points="19 12 12 19 5 12"></polyline>
            </svg>
          </div>

          <div className="info-step">
            <div className="info-icon-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12h10"></path>
                <path d="M9 4v16"></path>
                <path d="M3 9l9 6 9-6"></path>
                <path d="M13 12h9"></path>
              </svg>
            </div>
            <div className="info-content">
              <h4>2. Refinement & Critique</h4>
              <p>Specialized "Critic" agents review the initial drafts, identifying strengths, weaknesses, and areas for improvement. They refine the content to ensure accuracy and quality.</p>
            </div>
          </div>

          <div className="info-arrow">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <polyline points="19 12 12 19 5 12"></polyline>
            </svg>
          </div>

          <div className="info-step">
            <div className="info-icon-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
              </svg>
            </div>
            <div className="info-content">
              <h4>3. Synthesis</h4>
              <p>A final "Synthesizer" agent takes the best elements from all refined drafts and combines them into a single, high-quality, comprehensive response.</p>
            </div>
          </div>
        </div>
      </BaseModal.Body>
      
      <BaseModal.Footer className="justify-end">
        <button className="modal-btn save" onClick={onClose}>Got it</button>
      </BaseModal.Footer>
    </BaseModal>
  );
};
