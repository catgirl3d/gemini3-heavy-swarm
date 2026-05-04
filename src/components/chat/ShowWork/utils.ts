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
  if (!info || typeof info !== 'object') return "No debug info available.";
  
  const debugInfo = info as Record<string, unknown>;
  let output = "";
  
  if (debugInfo.systemInstruction && typeof debugInfo.systemInstruction === 'string') {
    output += `### System Instruction\n\n\`\`\`xml\n${debugInfo.systemInstruction.trim()}\n\`\`\`\n\n`;
  }

  if (debugInfo.history && Array.isArray(debugInfo.history)) {
    output += `### Chat History\n\n`;
    debugInfo.history.forEach((msg: any) => {
      output += `#### ${msg.role}\n`;
      if (msg.parts && Array.isArray(msg.parts)) {
        msg.parts.forEach((part: any) => {
          if (part.text) output += `\`\`\`\n${part.text.trim()}\n\`\`\`\n\n`;
          if (part.inlineData) output += `*[Image Data]*\n\n`;
        });
      }
    });
  }

  if (debugInfo.userTurn && typeof debugInfo.userTurn === 'object') {
    const userTurn = debugInfo.userTurn as Record<string, unknown>;
    output += `### Current Turn\n\n`;
    output += `#### ${userTurn.role}\n`;
    if (userTurn.parts && Array.isArray(userTurn.parts)) {
      userTurn.parts.forEach((part: any) => {
        if (part.text) output += `\`\`\`xml\n${part.text.trim()}\n\`\`\`\n\n`;
        if (part.inlineData) output += `*[Image Data]*\n\n`;
      });
    }
  }

  return output;
};
