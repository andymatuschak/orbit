/** Shared copy; callers supply their own authentication/settings links. */
export function reviewReminderEmail(input: {
  reviewURL: string;
  snoozeURL: string;
  unsubscribeURL: string;
}) {
  const htmlURL = (url: string) =>
    url
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;");
  return {
    subject: "Your next Orbit review session is ready",
    text: `Take a few minutes to review the ideas you've been bringing into your orbit. Click here to begin: ${input.reviewURL}

---

Questions? Thoughts? Please reply and let me know.

To snooze review notifications for a week, click here: ${input.snoozeURL}

To unsubscribe from review notifications, click here: ${input.unsubscribeURL}`,
    html: `<p>Take a few minutes to review the ideas you've been bringing into your orbit. <a href="${htmlURL(input.reviewURL)}">Click here to begin.</a></p>
<p style="font-size: 80%; color: #666; margin-top: 3em;">Comments? Thoughts? Please reply and let me know.</p>
<p style="font-size: 80%; color: #666">To snooze review notifications for a week, <a href="${htmlURL(input.snoozeURL)}">click here.</a></p>
<p style="font-size: 80%; color: #666">To unsubscribe from review notifications, <a href="${htmlURL(input.unsubscribeURL)}">click here.</a></p>`,
  };
}
