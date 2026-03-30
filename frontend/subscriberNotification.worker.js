/* eslint-disable @typescript-eslint/no-require-imports */
// subscriberNotification.worker.js
const { getMatchingSubscribers } = require("../modules/notifications/subscriberMatcher.service");
const { sendWhatsApp } = require("../modules/notifications/messageBuilder.service");

queue.process(async (job) => {
  const ad = job.data;

  const subscribers = await getMatchingSubscribers(ad);

  for (const subscriber of subscribers) {
    if (subscriber.score >= 40) {
      await sendWhatsApp(subscriber.phone, buildMessage(ad));
    }
  }
});
