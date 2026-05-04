import React, { type FC } from 'react';
import { type Source } from '@/types';
import './Sources.css';

export const Sources: FC<{ sources: Source[] }> = ({ sources }) => (
  <div className="sources-container">
    <h3 className="sources-title">Sources & Citations</h3>
    <div className="sources-list">
      {sources.map((source, index) => (
        <a key={index} href={source.uri} target="_blank" rel="noopener noreferrer" className="source-link">
          <div className="source-index">{index + 1}</div>
          <div className="source-title">{source.title || new URL(source.uri).hostname}</div>
          <svg className="source-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6v2H5v11h11v-5h2v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6zm11-3v8h-2V6.41l-7.79 7.79-1.42-1.42L17.59 5H13V3h8z" />
          </svg>
        </a>
      ))}
    </div>
  </div>
);
