# Fleet Early Warning System (FEWS) - V2 Production Ready

A serverless AWS-based system for processing fleet telemetry events and sending emergency alerts via email.

## Architecture

- **API Gateway** → Ingestion endpoint with API key authentication
- **Lambda (Ingest)** → Validates and queues events to SQS
- **SQS Queue** → Decouples ingestion from processing
- **Lambda (Worker)** → Processes events and sends alerts via Amazon SES
- **Dead Letter Queue** → Captures failed messages for investigation
- **CloudWatch** → Logging, metrics, and alarms

## Features

- ✅ Production-ready with Amazon SES email delivery
- ✅ Partial batch failure handling (no duplicate emails)
- ✅ Input validation and error handling
- ✅ Structured JSON logging with correlation IDs
- ✅ Dead Letter Queue for failed messages
- ✅ CloudWatch alarms for monitoring
- ✅ Encryption at rest for SQS queues
- ✅ Rate limiting (15 RPS, 2000 burst)

## Prerequisites

1. AWS Account with appropriate permissions
2. Node.js 22.x or later
3. Serverless Framework 4.x
4. Amazon SES verified sender email

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Amazon SES

Verify your sender email address:

```bash
aws ses verify-email-identity --email-address alerts@yourdomain.com
```

Check verification status:

```bash
aws ses get-identity-verification-attributes --identities alerts@yourdomain.com
```

### 3. Set Environment Variables

```bash
export SENDER_EMAIL="alerts@yourdomain.com"
export ALERT_RECIPIENT="operations@yourdomain.com"
export LOG_LEVEL="INFO"
```

### 4. Deploy

```bash
serverless deploy --stage prod
```

### 5. Get API Key

```bash
aws apigateway get-api-keys --include-values --query "items[?name=='fleet-api-key-prod'].value" --output text
```

### 6. Test

```bash
API_ENDPOINT="https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/event"
API_KEY="your-api-key-here"

curl -X POST "$API_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "type": "Emergency",
    "vehicle_plate": "ABC-1234",
    "latitude": 40.7128,
    "longitude": -74.0060
  }'
```

## Monitoring

### View Logs

```bash
# Ingest Lambda
serverless logs -f ingest --stage prod --tail

# Worker Lambda
serverless logs -f worker --stage prod --tail
```

### Check Queue Status

```bash
# Main queue
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name fleet-events-queue-prod --query 'QueueUrl' --output text) \
  --attribute-names All

# Dead Letter Queue
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name fleet-events-dlq-prod --query 'QueueUrl' --output text) \
  --attribute-names ApproximateNumberOfMessages
```

## Project Structure

```
FEWS-Project/
├── package.json              # Dependencies
├── serverless.yml            # Infrastructure as Code
├── .env.example              # Environment variables template
└── src/
    ├── handlers/
    │   ├── ingest.js         # API Gateway handler
    │   └── worker.js         # SQS worker handler
    ├── services/
    │   └── NotificationService.js  # Email sending logic
    └── utils/
        └── logger.js         # Structured logging
```

## Configuration

### Environment Variables

- `SENDER_EMAIL` - Verified SES sender email address
- `ALERT_RECIPIENT` - Recipient email(s), comma-separated
- `LOG_LEVEL` - Logging level (DEBUG, INFO, WARN, ERROR)

### Throttling

- Rate Limit: 15 requests/second
- Burst Limit: 2000 requests
- Worker Concurrency: 5 concurrent executions
- Batch Size: 10 messages per invocation

## Troubleshooting

### Emails Not Sending

1. Verify SES email addresses are verified
2. Check if AWS account is in SES sandbox mode
3. Review worker Lambda logs for errors
4. Verify IAM permissions for SES

### Messages in DLQ

1. Check DLQ messages for patterns
2. Review worker Lambda logs
3. Verify message format and validation logic

### API Returns 403

- Ensure `x-api-key` header is included
- Verify API key value is correct

## Security

- API Gateway protected with API keys
- IAM roles follow least privilege principle
- SQS queues encrypted at rest
- No credentials in code
- Input validation on all endpoints

## License

MIT
