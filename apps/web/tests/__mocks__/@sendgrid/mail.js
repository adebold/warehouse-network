// Mock for @sendgrid/mail
module.exports = {
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202 }]),
  sendMultiple: jest.fn().mockResolvedValue([{ statusCode: 202 }]),
};
