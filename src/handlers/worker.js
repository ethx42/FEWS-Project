const { sendAlert } = require('../services/NotificationService');
const logger = require('../utils/logger');

/**
 * SQS worker handler for processing fleet telemetry events
 * Implements partial batch failure handling to prevent duplicate processing
 */
exports.handler = async (event) => {
    logger.info('Worker processing batch', {
        batchSize: event.Records.length
    });

    const batchItemFailures = [];

    for (const record of event.Records) {
        const messageId = record.messageId;
        
        try {
            logger.debug('Processing SQS record', {
                messageId,
                receiptHandle: record.receiptHandle.substring(0, 20) + '...'
            });

            const telemetryPayload = JSON.parse(record.body);
            
            const result = await sendAlert(telemetryPayload, messageId);
            
            logger.info('Record processed successfully', {
                messageId,
                result: result.status,
                vehiclePlate: telemetryPayload.vehicle_plate
            });

        } catch (error) {
            logger.error('Failed to process record', {
                messageId,
                error: error.message,
                errorStack: error.stack
            });
            
            batchItemFailures.push({
                itemIdentifier: messageId
            });
        }
    }

    const successCount = event.Records.length - batchItemFailures.length;
    logger.info('Batch processing complete', {
        totalRecords: event.Records.length,
        successCount,
        failureCount: batchItemFailures.length
    });

    return {
        batchItemFailures
    };
};
