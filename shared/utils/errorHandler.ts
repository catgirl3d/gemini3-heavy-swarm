import { Logger } from './logger';

const logger = new Logger('UIFeedback');

/**
 * Creates an error handler function that uses onShowError if provided,
 * or logs to console and shows a window alert as fallback.
 */
export const createErrorHandler = (onShowError?: (message: string) => void) => 
    (message: string) => {
        if (onShowError) {
            onShowError(message);
        } else {
            logger.warn('No error handler provided:', message);
            if (typeof window !== 'undefined' && window.alert) {
                window.alert(message);
            }
        }
    };
