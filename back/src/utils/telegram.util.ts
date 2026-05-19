import { Logger } from '@nestjs/common';

const logger = new Logger('TelegramUtil');

export async function getSafeSender(event: any, client: any): Promise<any> {
  try {
    const msg = event?.message;
    if (!msg) return null;
    
    // 1. Try directly calling getSender from message
    if (typeof msg.getSender === 'function') {
      const sender = await msg.getSender();
      if (sender) return sender;
    }

    // 2. Try directly calling getSender from event itself
    if (typeof event.getSender === 'function') {
      const sender = await event.getSender();
      if (sender) return sender;
    }
    
    // 3. Fallback: Resolve via peerId / senderId from client entity cache
    const senderId = msg.senderId || msg.peerId?.userId;
    if (senderId && client) {
      try {
        const entity = await client.getEntity(senderId);
        if (entity) return entity;
      } catch (err) {
        // Suppress entity not found warning
      }
    }
  } catch (error) {
    logger.debug(`Failed to get safe sender: ${error.message}`);
  }
  return null;
}

export async function getSafeChat(event: any, client: any): Promise<any> {
  try {
    // 1. Try getChat on the event
    if (typeof event.getChat === 'function') {
      const chat = await event.getChat();
      if (chat) return chat;
    }
    
    const msg = event?.message;
    
    // 2. Try getChat on the message
    if (msg && typeof msg.getChat === 'function') {
      const chat = await msg.getChat();
      if (chat) return chat;
    }
    
    // 3. Fallback: Resolve via peerId or chatId
    const peerId = msg?.peerId || event?.chatId;
    if (peerId && client) {
      try {
        const entity = await client.getEntity(peerId);
        if (entity) return entity;
      } catch (err) {
        // Suppress entity not found warning
      }
    }
  } catch (error) {
    logger.debug(`Failed to get safe chat: ${error.message}`);
  }
  return null;
}

export function getSafeMessageText(event: any): string {
  try {
    return event?.message?.message || '';
  } catch (error) {
    return '';
  }
}
