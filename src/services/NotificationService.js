const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const logger = require("../utils/logger");

const sesClient = new SESClient({});

/**
 * Validates the event payload structure
 * @param {Object} eventBody - The telemetry event payload
 * @returns {Object} Validation result { valid: boolean, error?: string }
 */
function validateEventPayload(eventBody) {
  if (!eventBody.type) {
    return { valid: false, error: "Missing required field: type" };
  }

  if (!eventBody.vehicle_plate) {
    return { valid: false, error: "Missing required field: vehicle_plate" };
  }

  const latitude = eventBody.coordinates?.latitude ?? eventBody.latitude;
  const longitude = eventBody.coordinates?.longitude ?? eventBody.longitude;

  if (
    latitude !== undefined &&
    (typeof latitude !== "number" || latitude < -90 || latitude > 90)
  ) {
    return { valid: false, error: "Invalid latitude value" };
  }

  if (
    longitude !== undefined &&
    (typeof longitude !== "number" || longitude < -180 || longitude > 180)
  ) {
    return { valid: false, error: "Invalid longitude value" };
  }

  return { valid: true };
}

/**
 * Sends emergency alert via Amazon SES
 * @param {Object} eventBody - The telemetry event payload
 * @param {string} messageId - SQS message ID for correlation
 * @returns {Promise<Object>} Result { status: string, reason?: string, messageId?: string }
 */
async function sendAlert(eventBody, messageId = "unknown") {
  const correlationId = messageId;

  logger.info("Processing event", {
    correlationId,
    eventType: eventBody.type,
    vehiclePlate: eventBody.vehicle_plate,
  });

  const validation = validateEventPayload(eventBody);
  if (!validation.valid) {
    logger.warn("Invalid event payload", {
      correlationId,
      error: validation.error,
    });
    return { status: "Invalid", reason: validation.error };
  }

  if (eventBody.type !== "Emergency") {
    logger.info("Event filtered out (not Emergency)", {
      correlationId,
      eventType: eventBody.type,
    });
    return { status: "Ignored", reason: "Not Emergency" };
  }

  const dispatchTime = new Date().toISOString();
  logger.info("Emergency detected, sending email", {
    correlationId,
    vehiclePlate: eventBody.vehicle_plate,
    dispatchTime: dispatchTime,
    emailDispatchTimestamp: dispatchTime,
  });

  try {
    const latitude = eventBody.coordinates?.latitude ?? eventBody.latitude;
    const longitude = eventBody.coordinates?.longitude ?? eventBody.longitude;

    const emailBody = `FLEET EMERGENCY ALERT

Vehicle Plate: ${eventBody.vehicle_plate}
Event Type: ${eventBody.type}
Coordinates: ${latitude || "N/A"}, ${longitude || "N/A"}
Status: ${eventBody.status || "N/A"}
Dispatch Time: ${dispatchTime}
Correlation ID: ${correlationId}

This is an automated alert from the Fleet Early Warning System.`;

    const command = new SendEmailCommand({
      Source: process.env.SENDER_EMAIL,
      Destination: {
        ToAddresses: process.env.ALERT_RECIPIENT.split(",").map((email) =>
          email.trim()
        ),
      },
      Message: {
        Subject: {
          Data: `🚨 CRITICAL ALERT: Vehicle ${eventBody.vehicle_plate}`,
          Charset: "UTF-8",
        },
        Body: {
          Text: {
            Data: emailBody,
            Charset: "UTF-8",
          },
        },
      },
    });

    const response = await sesClient.send(command);

    const emailSentTime = new Date().toISOString();
    logger.info("Email sent successfully", {
      correlationId,
      sesMessageId: response.MessageId,
      vehiclePlate: eventBody.vehicle_plate,
      emailSentTimestamp: emailSentTime,
      dispatchTime: dispatchTime,
    });

    return {
      status: "Success",
      messageId: response.MessageId,
      correlationId,
    };
  } catch (error) {
    // Identificar errores transitorios que deberían reintentarse
    const isTransientError =
      error.code === "Throttling" ||
      error.code === "ServiceUnavailable" ||
      error.message.includes("Daily message quota exceeded") ||
      error.message.includes("quota") ||
      error.message.includes("rate limit");

    logger.error("Failed to send email", {
      correlationId,
      error: error.message,
      errorCode: error.code,
      vehiclePlate: eventBody.vehicle_plate,
      isTransientError,
      shouldRetry: isTransientError,
    });

    // Para errores transitorios, lanzar un error especial que indique que debe reintentarse
    if (isTransientError) {
      const retryError = new Error(
        `Email dispatch failure (transient): ${error.message}`
      );
      retryError.code = error.code || "TransientError";
      retryError.isTransient = true;
      throw retryError;
    }

    // Para errores permanentes, lanzar error normal
    throw new Error(`Email dispatch failure: ${error.message}`);
  }
}

module.exports = {
  sendAlert,
  validateEventPayload,
};
