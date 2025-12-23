export const downloadContent = (filename: string, content: string) => {
  const element = document.createElement('a');
  const file = new Blob([content], { type: 'text/markdown' });
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};

export const formatDebugInfo = (info: any) => {
  if (!info) return "No debug info available.";
  
  let output = "";
  
  if (info.systemInstruction) {
    output += `### System Instruction\n\n\`\`\`xml\n${info.systemInstruction.trim()}\n\`\`\`\n\n`;
  }

  if (info.history && Array.isArray(info.history)) {
    output += `### Chat History\n\n`;
    info.history.forEach((msg: any) => {
      output += `#### ${msg.role}\n`;
      if (msg.parts) {
        msg.parts.forEach((part: any) => {
          if (part.text) output += `\`\`\`\n${part.text.trim()}\n\`\`\`\n\n`;
          if (part.inlineData) output += `*[Image Data]*\n\n`;
        });
      }
    });
  }

  if (info.userTurn) {
    output += `### Current Turn\n\n`;
    output += `#### ${info.userTurn.role}\n`;
    if (info.userTurn.parts) {
      info.userTurn.parts.forEach((part: any) => {
        if (part.text) output += `\`\`\`xml\n${part.text.trim()}\n\`\`\`\n\n`;
        if (part.inlineData) output += `*[Image Data]*\n\n`;
      });
    }
  }

  return output;
};
