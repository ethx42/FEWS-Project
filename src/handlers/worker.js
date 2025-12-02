const { sendAlert } = require("../services/NotificationService");
const logger = require("../utils/logger");

/**
 * SQS worker handler for processing fleet telemetry events
 * Implements partial batch failure handling to prevent duplicate processing
 */
exports.handler = async (event) => {
  logger.info("Worker processing batch", {
    batchSize: event.Records.length,
  });

  const batchItemFailures = [];

  for (const record of event.Records) {
    const messageId = record.messageId;

    try {
      logger.debug("Processing SQS record", {
        messageId,
        receiptHandle: record.receiptHandle.substring(0, 20) + "...",
      });

      const telemetryPayload = JSON.parse(record.body);

      const result = await sendAlert(telemetryPayload, messageId);

      logger.info("Record processed successfully", {
        messageId,
        result: result.status,
        vehiclePlate: telemetryPayload.vehicle_plate,
      });
    } catch (error) {
      const isTransientError =
        error.isTransient ||
        error.message.includes("quota") ||
        error.message.includes("Throttling") ||
        error.message.includes("rate limit");

      logger.error("Failed to process record", {
        messageId,
        error: error.message,
        errorCode: error.code,
        errorStack: error.stack,
        isTransientError,
        vehiclePlate: telemetryPayload?.vehicle_plate,
        eventType: telemetryPayload?.type,
      });

      if (!isTransientError) {
        batchItemFailures.push({
          itemIdentifier: messageId,
        });
      } else {
        logger.warn(
          "Transient error detected, message will be retried by SQS",
          {
            messageId,
            error: error.message,
          }
        );
      }
    }
  }

  const successCount = event.Records.length - batchItemFailures.length;
  logger.info("Batch processing complete", {
    totalRecords: event.Records.length,
    successCount,
    failureCount: batchItemFailures.length,
  });

  return {
    batchItemFailures,
  };
};
