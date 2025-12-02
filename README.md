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
5. AWS CLI configured with appropriate profile
6. k6 (for load testing) - Install: `brew install k6` (macOS) or see [k6 installation guide](https://k6.io/docs/getting-started/installation/)

## Quick Start

### 1. Install Dependencies

```bash
yarn install
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
export AWS_PROFILE="fleet-monitor-profile"
export SENDER_EMAIL="custom-email+fleetmonitor@gmail.com"
export ALERT_RECIPIENT="target-email@gmail.com"
export LOG_LEVEL="INFO"
```

**Note:** Adjust `SENDER_EMAIL` and `ALERT_RECIPIENT` values according to your configuration. The `AWS_PROFILE` must correspond to a profile configured in `~/.aws/credentials`.

### 4. Deploy

```bash
serverless deploy --stage prod
```

The deployment will create:

- API Gateway with `/event` endpoint
- Lambda functions (ingest and worker)
- SQS queues (main queue and DLQ)
- CloudWatch alarms
- API Key for authentication

### 5. Get API Key and Endpoint

**Manual commands**

```bash
# Get endpoint URL
aws cloudformation describe-stacks \
  --stack-name fleet-warning-system-prod \
  --query "Stacks[0].Outputs[?OutputKey=='ServiceEndpoint'].OutputValue" \
  --output text

# Get API key
aws apigateway get-api-keys \
  --include-values \
  --query "items[?name=='fleet-api-key-prod'].value" \
  --output text
```

**⚠️ Keep API key stable between deployments:**

To prevent the API key from changing on each deployment, save the value and reuse it:

```bash
# 1. Get current API key
export API_KEY_VALUE=$(aws apigateway get-api-keys \
  --include-values \
  --query "items[?name=='fleet-api-key-prod'].value" \
  --output text)

# 2. Deploy with existing API key
export AWS_PROFILE="fleet-monitor-profile"
export SENDER_EMAIL="custom-email+fleetmonitor@gmail.com"
export ALERT_RECIPIENT="target-email@gmail.com"
export LOG_LEVEL="INFO"
serverless deploy --stage prod
```

**Note:** The endpoint URL should remain stable unless you completely delete the stack. If it changes, verify that the API Gateway hasn't been recreated.

### 6. Configure API Gateway Throttling

After initial deployment, configure Stage-level throttling to meet technical requirements:

```bash
export API_ID="iyjdpkak5f"  # Replace with your API Gateway ID

aws apigateway update-stage \
  --rest-api-id $API_ID \
  --stage-name prod \
  --patch-operations '[
    {
      "op": "replace",
      "path": "/*/*/throttling/rateLimit",
      "value": "15"
    },
    {
      "op": "replace",
      "path": "/*/*/throttling/burstLimit",
      "value": "2000"
    }
  ]'
```

**Note:** The API Gateway ID can be obtained from the endpoint URL or AWS console. This configuration applies throttling at the Stage level (all requests), complementing the Usage Plan configuration in `serverless.yml`.

### 7. Test

**Option 1: Individual test with curl**

```bash
API_ENDPOINT="https://iyjdpkak5f.execute-api.us-east-1.amazonaws.com/prod/event"
API_KEY="your-api-key-here"  # Get API key using commands in section 5

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

**Option 2: Load test with k6 (recommended)**

Run load test to validate throughput of 1000 requests in 30 seconds:

```bash
k6 run -e API_KEY="your-api-key-here" load-test.js
```

The `load-test.js` script is configured for:

- 1000 iterations in 30 seconds
- 10 virtual users (VUs)
- 5% probability of emergency events
- Automatic response validation

**Get API key:**

```bash
# Manual command
aws apigateway get-api-keys \
  --include-values \
  --query "items[?name=='fleet-api-key-prod'].value" \
  --output text
```

## Monitoring

### View Logs

Logs are stored in **AWS CloudWatch Logs** in structured JSON format.

**Log Group Locations:**

- Ingest: `/aws/lambda/fleet-warning-system-prod-ingest`
- Worker: `/aws/lambda/fleet-warning-system-prod-worker`

**View logs with Serverless Framework (recommended):**

```bash
# Ingest Lambda (real-time)
serverless logs -f ingest --stage prod --tail

# Worker Lambda (real-time)
serverless logs -f worker --stage prod --tail

# Last 100 logs
serverless logs -f ingest --stage prod --tail 100
```

**View logs with AWS CLI:**

```bash
# Ingest (last 5 minutes)
aws logs tail /aws/lambda/fleet-warning-system-prod-ingest \
  --since 5m --format short --region us-east-1

# Worker (last 5 minutes)
aws logs tail /aws/lambda/fleet-warning-system-prod-worker \
  --since 5m --format short --region us-east-1

# Filter only emergencies
aws logs filter-log-events \
  --log-group-name /aws/lambda/fleet-warning-system-prod-ingest \
  --filter-pattern "Emergency event received" \
  --region us-east-1
```

**View logs in AWS Console:**

1. Go to [CloudWatch Console](https://console.aws.amazon.com/cloudwatch/)
2. Logs → Log groups
3. Search for `/aws/lambda/fleet-warning-system-prod-ingest` or `...prod-worker`

### Check Queue Status

**Option 1: Use helper script (recommended)**

```bash
./monitor-sqs.sh prod
```

**Option 2: Manual commands**

```bash
# Get main queue URL from CloudFormation
QUEUE_URL=$(aws cloudformation describe-stacks \
  --stack-name fleet-warning-system-prod \
  --query "Stacks[0].Outputs[?OutputKey=='QueueUrl'].OutputValue" \
  --output text)

# Check main queue status
aws sqs get-queue-attributes \
  --queue-url "$QUEUE_URL" \
  --attribute-names ApproximateNumberOfMessagesVisible ApproximateAgeOfOldestMessage \
  --region us-east-1

# Check DLQ messages
DLQ_URL=$(aws cloudformation describe-stacks \
  --stack-name fleet-warning-system-prod \
  --query "Stacks[0].Outputs[?OutputKey=='DLQUrl'].OutputValue" \
  --output text)

aws sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names ApproximateNumberOfMessagesVisible \
  --region us-east-1
```

**Note:** SQS doesn't generate logs directly. Processing logs are in the Lambda worker. Check metrics in CloudWatch or use the helper script.

## Project Structure

```
FEWS-Project/
├── package.json              # Dependencies
├── serverless.yml            # Infrastructure as Code
├── load-test.js              # k6 load testing script
├── monitor-sqs.sh            # Helper script to monitor SQS
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

The system is configured with throttling at two levels:

**API Gateway Stage-level:**

- Rate Limit: 15 requests/second
- Burst Limit: 2000 requests
- Configured via AWS CLI after deployment (see section 6)

**API Gateway Usage Plan-level:**

- Rate Limit: 15 requests/second
- Burst Limit: 2000 requests
- Configured in `serverless.yml`

**Lambda Worker:**

- Batch Size: 10 messages per invocation
- Concurrency: Unlimited (can be configured with `reservedConcurrency`)

**Note:** The 15 req/s rate limit allows demonstrating the challenge technique: fast processing (<200ms) to release slots quickly and achieve effective throughput greater than 15 req/s, meeting the goal of 1000 requests in 30 seconds.

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
