import { Content, Part } from '@google/genai';
import { Message } from '@/types';

export const prepareGeminiContent = (
  history: Message[],
  userInput: string,
  image: string | null,
  imageFile: File | null
): { history: Content[], baseApiParts: Part[] } => {
  const mainChatHistory: Content[] = history.map(msg => ({
    role: msg.role,
    parts: msg.parts,
  }));

  const baseApiParts: Part[] = [];
  if (image) {
    let mimeType = 'image/jpeg';
    if (imageFile) {
      mimeType = imageFile.type;
    } else {
      const match = image.match(/^data:([^;]+);base64,/);
      if (match) mimeType = match[1];
    }
    baseApiParts.push({
      inlineData: {
        mimeType: mimeType,
        data: image.split(',')[1],
      },
    });
  }
  if (userInput.trim()) {
    baseApiParts.push({ text: userInput });
  }

  return { history: mainChatHistory, baseApiParts };
};