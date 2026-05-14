/**
 * Abstract base class for all mailer adapters.
 * Defines the interface for sending transactional emails.
 *
 * @see AI_Architecture_V2.md section 5.2
 */
export class MailerAdapter {
  /**
   * Sends an email.
   * @param {Object} options
   * @param {string} options.to - The recipient's email address.
   * @param {string} options.subject - The email subject.
   * @param {string} options.text - The plain text body of the email.
   * @param {string} options.html - The HTML body of the email.
   * @returns {Promise<void>}
   */
  async send(_options) {
    throw new Error("MailerAdapter.send() must be implemented by subclasses.");
  }
}
