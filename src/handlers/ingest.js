const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const logger = require("../utils/logger");

const sqsClient = new SQSClient({});
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;

/**
 * API Gateway handler for fleet telemetry ingestion
 * Validates payload and enqueues to SQS for async processing
 */
exports.handler = async (event) => {
  const receptionTime = new Date().toISOString();

  logger.info("Ingest request received", {
    receptionTime,
    sourceIp: event.requestContext?.identity?.sourceIp,
  });

  try {
    let payload;
    try {
      payload = JSON.parse(event.body);
    } catch (parseError) {
      logger.warn("Invalid JSON payload", {
        error: parseError.message,
      });
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Invalid JSON payload",
          message: "Request body must be valid JSON",
        }),
      };
    }

    if (!payload.type) {
      logger.warn("Missing required field: type");
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Missing required field",
          message: 'Field "type" is required',
        }),
      };
    }

    if (!payload.vehicle_plate) {
      logger.warn("Missing required field: vehicle_plate");
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Missing required field",
          message: 'Field "vehicle_plate" is required',
        }),
      };
    }

    const latitude = payload.coordinates?.latitude ?? payload.latitude;
    const longitude = payload.coordinates?.longitude ?? payload.longitude;

    if (
      latitude !== undefined &&
      (typeof latitude !== "number" || latitude < -90 || latitude > 90)
    ) {
      logger.warn("Invalid latitude value", { latitude });
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Invalid field value",
          message: 'Field "latitude" must be a number between -90 and 90',
        }),
      };
    }

    if (
      longitude !== undefined &&
      (typeof longitude !== "number" || longitude < -180 || longitude > 180)
    ) {
      logger.warn("Invalid longitude value", { longitude });
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Invalid field value",
          message: 'Field "longitude" must be a number between -180 and 180',
        }),
      };
    }

    const command = new SendMessageCommand({
      QueueUrl: SQS_QUEUE_URL,
      MessageBody: JSON.stringify(payload),
      MessageAttributes: {
        ReceptionTime: {
          DataType: "String",
          StringValue: receptionTime,
        },
        EventType: {
          DataType: "String",
          StringValue: payload.type,
        },
      },
    });

    const result = await sqsClient.send(command);

    if (payload.type === "Emergency") {
      logger.info("Emergency event received", {
        receptionTime: receptionTime,
        messageId: result.MessageId,
        vehiclePlate: payload.vehicle_plate,
        eventType: payload.type,
        coordinates: {
          latitude: payload.coordinates?.latitude ?? payload.latitude,
          longitude: payload.coordinates?.longitude ?? payload.longitude,
        },
      });
    }

    logger.info("Event queued successfully", {
      messageId: result.MessageId,
      vehiclePlate: payload.vehicle_plate,
      eventType: payload.type,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Event queued successfully",
        messageId: result.MessageId,
      }),
    };
  } catch (error) {
    logger.error("Failed to queue message", {
      error: error.message,
      errorCode: error.code,
    });

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        message: "Failed to process event",
      }),
    };
  }
};
