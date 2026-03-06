export const QUEUE_NAMES = {
  WHATSAPP: "whatsapp",
};

export const QUEUE_DEFAULT_JOB_OPTIONS = {
  removeOnComplete: 100,
  removeOnFail: 1000,
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 3000,
  },
};
