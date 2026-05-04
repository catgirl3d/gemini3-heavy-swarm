type DebugPart = {
  text?: string;
  inlineData?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isDebugPart = (value: unknown): value is DebugPart => {
  return isRecord(value) && (typeof value.text === 'string' || 'inlineData' in value);
};

const getDebugParts = (content: Record<string, unknown>): DebugPart[] => {
  return Array.isArray(content.parts) ? content.parts.filter(isDebugPart) : [];
};

const appendDebugParts = (parts: DebugPart[], language: 'plain' | 'xml') => {
  let output = '';

  parts.forEach(part => {
    if (part.text) output += `\`\`\`${language === 'xml' ? 'xml' : ''}\n${part.text.trim()}\n\`\`\`\n\n`;
    if (part.inlineData) output += `*[Image Data]*\n\n`;
  });

  return output;
};

export const downloadContent = (filename: string, content: string) => {
  const element = document.createElement('a');
  const file = new Blob([content], { type: 'text/markdown' });
  const objectUrl = URL.createObjectURL(file);
  element.href = objectUrl;
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  URL.revokeObjectURL(objectUrl);
};

export const formatDebugInfo = (info: unknown) => {
  if (!isRecord(info)) return "No debug info available.";
  
  const debugInfo = info;
  let output = "";
  
  if (typeof debugInfo.systemInstruction === 'string') {
    output += `### System Instruction\n\n\`\`\`xml\n${debugInfo.systemInstruction.trim()}\n\`\`\`\n\n`;
  }

  if (Array.isArray(debugInfo.history)) {
    output += `### Chat History\n\n`;
    debugInfo.history.forEach(msg => {
      if (!isRecord(msg)) return;

      output += `#### ${typeof msg.role === 'string' ? msg.role : ''}\n`;
      output += appendDebugParts(getDebugParts(msg), 'plain');
    });
  }

  if (isRecord(debugInfo.userTurn)) {
    const userTurn = debugInfo.userTurn;
    output += `### Current Turn\n\n`;
    output += `#### ${typeof userTurn.role === 'string' ? userTurn.role : ''}\n`;
    output += appendDebugParts(getDebugParts(userTurn), 'xml');
  }

  return output;
};
