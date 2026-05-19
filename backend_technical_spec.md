# Backend Technical Specification (NestJS)

## 1. Module Responsibilities

| Module | Responsibility |
| :--- | :--- |
| **Auth** | User signup, login, JWT issuance, and `AuthGuard`. |
| **Users** | Profile management and user-specific settings. |
| **Telegram** | MTProto client lifecycle, `stringSession` generation, and sync state. |
| **Ingestion** | Listening to TG events, message deduplication, and queueing. |
| **AI** | Wrapper for Gemini API, prompt templates, and rate limit handling. |
| **Memory** | Embedding generation and MongoDB Vector Search integration. |
| **Summary** | Scheduled jobs for daily/weekly digest generation. |
| **Notification** | WebSocket gateway and smart alert logic. |

## 2. Data Transfer Objects (DTOs)

### Telegram Login DTO
```typescript
export class ConnectTelegramDto {
  @IsPhoneNumber()
  phoneNumber: string;
}

export class VerifyTelegramCodeDto {
  @IsString()
  phoneNumber: string;

  @IsString()
  phoneCode: string;

  @IsOptional()
  @IsString()
  password?: string; // For 2FA
}
```

## 3. BullMQ Queue Architecture

We will use three primary queues:

1. **`tg-ingestion`**: Handles raw message ingestion from Telegram.
   - *Producer*: Telegram Service (MTProto listener).
   - *Consumer*: Ingestion Processor (Stores to DB).
2. **`ai-processing`**: Handles Gemini analysis and embeddings.
   - *Producer*: Ingestion Processor.
   - *Consumer*: AI Processor.
3. **`notifications`**: Handles sending alerts via WebSockets or Telegram.
   - *Producer*: AI Processor (if importance > 0.8).
   - *Consumer*: Notification Processor.

### Example Queue Definition (NestJS)
```typescript
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ai-processing',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
      },
    }),
  ],
})
export class AiModule {}
```

## 4. Telegram Session Strategy
To ensure security, the `stringSession` is never sent to the frontend. It is stored in the database encrypted.

```typescript
// telegram.service.ts
async connect(userId: string, code: string) {
  const user = await this.userService.findById(userId);
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {});
  
  await client.start({
    phoneNumber: user.phoneNumber,
    phoneCode: async () => code,
    onError: (err) => console.log(err),
  });

  const encryptedSession = this.cryptoService.encrypt(client.session.save());
  await this.userService.updateSession(userId, encryptedSession);
}
```

## 5. API Endpoint Structure

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **POST** | `/auth/register` | Create new user. |
| **POST** | `/tg/connect` | Start TG handshake. |
| **POST** | `/tg/verify` | Verify TG code. |
| **GET** | `/messages/search` | Semantic search messages. |
| **GET** | `/summaries/daily` | Get today's summary. |
| **GET** | `/memory/ask` | Ask AI a question about history. |

## 6. WebSocket Strategy
We use `@nestjs/websockets` to provide real-time updates on sync progress.
- **Event**: `sync_progress` -> `{ percent: 45, currentChat: 'Work' }`
- **Event**: `new_insight` -> `{ type: 'important', messageId: '...' }`
