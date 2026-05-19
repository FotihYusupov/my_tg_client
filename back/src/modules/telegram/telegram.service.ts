import { Injectable, BadRequestException, Logger, Inject, forwardRef, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { UsersService } from '../users/users.service';
import * as CryptoJS from 'crypto-js';

import { Api, password as PasswordUtils } from 'telegram';
import { NewMessage } from 'telegram/events';
import { getSafeSender, getSafeChat, getSafeMessageText } from '../../utils/telegram.util';

import { IngestionService } from '../ingestion/ingestion.service';
import { MessagesService } from '../messages/messages.service';

@Injectable()
export class TelegramService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramService.name);
  private clients = new Map<string, TelegramClient>();
  private phoneCodeHashes = new Map<string, string>();
  private liveClients = new Map<string, TelegramClient>();

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    @Inject(forwardRef(() => IngestionService))
    private ingestionService: IngestionService,
    private messagesService: MessagesService,
  ) {}

  private getApiConfig() {
    const apiId = this.configService.get<string>('TG_API_ID');
    const apiHash = this.configService.get<string>('TG_API_HASH');

    if (!apiId || !apiHash) {
      throw new Error('TG_API_ID or TG_API_HASH is not defined in environment variables');
    }

    return {
      apiId: parseInt(apiId),
      apiHash: apiHash,
    };
  }

  async sendCode(userId: string, phoneNumber: string) {
    const { apiId, apiHash } = this.getApiConfig();
    const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
      connectionRetries: 10,
      requestRetries: 5,
    });

    await client.connect();
    
    try {
      const { phoneCodeHash } = await client.sendCode(
        { apiId, apiHash },
        phoneNumber
      );

      this.clients.set(userId, client);
      this.phoneCodeHashes.set(userId, phoneCodeHash);
      
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to send code: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  async verifyCode(userId: string, phoneNumber: string, code: string, password?: string) {
    const client = this.clients.get(userId);
    const phoneCodeHash = this.phoneCodeHashes.get(userId);

    if (!client || !phoneCodeHash) {
      throw new BadRequestException('Session not found. Please request a code again.');
    }

    try {
      await client.start({
        phoneNumber: async () => phoneNumber,
        password: async () => password || '',
        phoneCode: async () => code,
        onError: async (err) => {
          this.logger.error(`Start Error: ${err.message}`);
          return true;
        },
      });

      const sessionString = client.session.save() as unknown as string;
      const encryptedSession = CryptoJS.AES.encrypt(
        sessionString,
        this.configService.get<string>('SESSION_SECRET') || 'secret'
      ).toString();

      const me = await client.getMe();
      
      await this.usersService.update(userId, {
        telegramId: me.id.toString(),
        phoneNumber: phoneNumber,
        tgSession: encryptedSession,
      });

      // Cleanup
      this.clients.delete(userId);
      this.phoneCodeHashes.delete(userId);

      // Trigger history sync in background
      await this.ingestionService.triggerHistorySync(userId);

      // Start real-time message listener for this user
      this.startLiveListener(userId).catch(err => {
        this.logger.error(`Failed to start live listener for user ${userId} after verification: ${err.message}`);
      });

      return { success: true, telegramId: me.id.toString() };
    } catch (error) {
      this.logger.error(`Verification failed: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  async getClientForUser(userId: string): Promise<TelegramClient> {
    const activeClient = this.liveClients.get(userId);
    if (activeClient && activeClient.connected) {
      return activeClient;
    }

    const user = await this.usersService.findById(userId);
    if (!user || !user.tgSession) {
      throw new Error('Telegram session not found for user');
    }

    const { apiId, apiHash } = this.getApiConfig();
    const sessionString = CryptoJS.AES.decrypt(
      user.tgSession,
      this.configService.get<string>('SESSION_SECRET') || 'secret'
    ).toString(CryptoJS.enc.Utf8);

    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
      connectionRetries: 10,
      requestRetries: 5,
      useWSS: false,
      autoReconnect: true,
      deviceModel: 'AI Second Brain Listener',
    });

    await client.connect();
    
    try {
      await client.invoke(new Api.account.UpdateStatus({ offline: true }));
    } catch (e) {
      this.logger.debug('Failed to set offline status', e);
    }
    
    return client;
  }

  async getApiClientForUser(userId: string): Promise<TelegramClient> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.tgSession) {
      throw new Error('Telegram session not found for user');
    }

    const { apiId, apiHash } = this.getApiConfig();
    const sessionString = CryptoJS.AES.decrypt(
      user.tgSession,
      this.configService.get<string>('SESSION_SECRET') || 'secret'
    ).toString(CryptoJS.enc.Utf8);

    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
      connectionRetries: 5,
      requestRetries: 3,
      useWSS: false,
      autoReconnect: true,
      deviceModel: 'AI Second Brain API',
    });

    await client.connect();
    
    try {
      await client.invoke(new Api.account.UpdateStatus({ offline: true }));
    } catch (e) {
      // Suppress
    }

    return client;
  }

  async checkSession(userId: string) {
    let client: TelegramClient | null = null;
    try {
      client = await this.getApiClientForUser(userId);
      const isAuthorized = await client.isUserAuthorized();
      if (!isAuthorized) {
        return { valid: false };
      }
      return { valid: true };
    } catch (error) {
      this.logger.warn(`Session check failed for user ${userId}: ${error.message}`);
      return { valid: false };
    } finally {
      if (client) {
        try {
          await client.disconnect();
        } catch (e) {}
      }
    }
  }

  async getDialogs(client: TelegramClient) {
    return client.getDialogs({ limit: 500 });
  }

  async getMessages(client: TelegramClient, chatId: any, options: { limit: number; offsetId?: number }) {
    return client.getMessages(chatId, {
      limit: options.limit,
      offsetId: options.offsetId,
    });
  }

  async onApplicationBootstrap() {
    this.initializeLiveListeners().catch(err => {
      this.logger.error(`Failed to initialize live listeners: ${err.message}`);
    });
  }

  async initializeLiveListeners() {
    this.logger.log('Initializing live Telegram message listeners for active sessions...');
    const users = await this.usersService.findAllWithSession();
    this.logger.log(`Found ${users.length} user(s) with active Telegram sessions.`);
    
    for (const user of users) {
      this.startLiveListener(user._id.toString()).catch(err => {
        this.logger.error(`Failed to start live listener for user ${user._id}: ${err.message}`);
      });
    }
  }

  async startLiveListener(userId: string) {
    // Clean up existing client for user if there is one
    const existing = this.liveClients.get(userId);
    if (existing) {
      this.logger.log(`Cleaning up existing live client for user ${userId}...`);
      try {
        await existing.disconnect();
      } catch (err) {
        this.logger.warn(`Failed to disconnect existing live client: ${err.message}`);
      }
      this.liveClients.delete(userId);
    }

    this.logger.log(`Starting live listener for user ${userId}...`);
    try {
      const client = await this.getClientForUser(userId);
      this.liveClients.set(userId, client);

      client.addEventHandler(async (event: any) => {
        try {
          const msg = event.message;
          if (!msg) return;

          // 1. Get Chat peer details using safe extraction utilities
          let tgChat = await getSafeChat(event, client);

          if (!tgChat && event.isPrivate) {
            try {
              tgChat = await getSafeSender(event, client);
            } catch (err) {
              this.logger.debug(`Could not get sender for private chat fallback: ${err.message}`);
            }
          }

          // Ultimate fallback: Construct a placeholder if resolving fails completely (e.g. peer user not cached in GramJS session)
          if (!tgChat) {
            let externalId = '';
            let chatType = 'group';
            
            if (msg.peerId) {
              if (msg.peerId.userId) {
                externalId = msg.peerId.userId.toString();
                chatType = 'private';
              } else if (msg.peerId.chatId) {
                externalId = msg.peerId.chatId.toString();
                chatType = 'group';
              } else if (msg.peerId.channelId) {
                externalId = msg.peerId.channelId.toString();
                chatType = 'channel';
              }
            }
            
            if (!externalId && event.chatId) {
              externalId = event.chatId.toString();
              if (event.isPrivate) chatType = 'private';
              else if (event.isChannel) chatType = 'channel';
            }

            if (externalId) {
              tgChat = {
                id: externalId,
                className: chatType === 'private' ? 'User' : (chatType === 'channel' ? 'Channel' : 'Chat'),
                title: `Chat ${externalId}`,
                firstName: `User ${externalId}`,
                broadcast: chatType === 'channel',
              };
              this.logger.log(`Created robust placeholder entity for unresolved chat ${externalId}`);
            }
          }

          if (!tgChat) {
            this.logger.warn(`Could not resolve chat for message ${msg.id}`);
            return;
          }

          // 2. Find or create the Chat in database
          const chat = await this.messagesService.findOrCreateChat(userId, tgChat);

          // 3. Get Sender details safely
          let tgSender = await getSafeSender(event, client);

          if (!tgSender && msg.senderId) {
            const senderStrId = msg.senderId.toString();
            tgSender = {
              id: senderStrId,
              firstName: `User ${senderStrId}`,
              username: undefined,
            };
          }

          // 4. Save message safely
          const tgMsgData = {
            id: msg.id,
            message: getSafeMessageText(event),
            date: msg.date,
            senderId: msg.senderId,
            _sender: tgSender,
          };

          await this.messagesService.saveMessage(userId, (chat._id as any).toString(), tgMsgData);
          this.logger.log(`[TelegramListener] Successfully saved live message ${msg.id} from chat "${chat.title}"`);
        } catch (error) {
          this.logger.error(`[TelegramListener] Error processing live telegram message: ${error.message}`);
        }
      }, new NewMessage({ incoming: true }));

      // GramJS handles automatic reconnection internally via the autoReconnect configuration.

    } catch (error) {
      this.logger.error(`Failed to start live listener for user ${userId}: ${error.message}`);
      this.liveClients.delete(userId);
      // Retry starting listener after a delay
      setTimeout(() => this.startLiveListener(userId), 15000);
    }
  }
}
