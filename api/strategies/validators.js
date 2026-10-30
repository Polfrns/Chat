const { z } = require('zod');

const MIN_PASSWORD_LENGTH = parseInt(process.env.MIN_PASSWORD_LENGTH, 10) || 8;

const allowedCharactersRegex = new RegExp(
  '^[' +
    'a-zA-Z0-9_.@#$%&*()' + // Basic Latin characters and symbols
    '\\p{Script=Latin}' + // Latin script characters
    '\\p{Script=Common}' + // Characters common across scripts
    '\\p{Script=Cyrillic}' + // Cyrillic script for Russian, etc.
    '\\p{Script=Devanagari}' + // Devanagari script for Hindi, etc.
    '\\p{Script=Han}' + // Han script for Chinese characters, etc.
    '\\p{Script=Arabic}' + // Arabic script
    '\\p{Script=Hiragana}' + // Hiragana script for Japanese
    '\\p{Script=Katakana}' + // Katakana script for Japanese
    '\\p{Script=Hangul}' + // Hangul script for Korean
    ']+$', // End of string
  'u', // Use Unicode mode
);
const injectionPatternsRegex = /('|--|\$ne|\$gt|\$lt|\$or|\{|\}|\*|;|<|>|\/|=)/i;

/* Zod 4 changed its default messages; keep the user-facing Zod 3 wording. */
const atLeast = (n) => ({ error: `String must contain at least ${n} character(s)` });
const atMost = (n) => ({ error: `String must contain at most ${n} character(s)` });
const invalidEmail = { error: 'Invalid email' };
const requiredString = () =>
  z.string({ error: (issue) => (issue.input === undefined ? 'Required' : undefined) });

const usernameSchema = requiredString()
  .min(2, atLeast(2))
  .max(80, atMost(80))
  .refine((value) => allowedCharactersRegex.test(value), {
    message: 'Invalid characters in username',
  })
  .refine((value) => !injectionPatternsRegex.test(value), {
    message: 'Potential injection attack detected',
  });

const loginSchema = z.object({
  email: requiredString().email(invalidEmail),
  password: requiredString()
    .min(MIN_PASSWORD_LENGTH, atLeast(MIN_PASSWORD_LENGTH))
    .max(128, atMost(128))
    .refine((value) => value.trim().length > 0, {
      message: 'Password cannot be only spaces',
    }),
});

const registerSchema = z
  .object({
    name: requiredString().min(3, atLeast(3)).max(80, atMost(80)),
    username: z
      .union([z.literal(''), usernameSchema])
      .transform((value) => (value === '' ? null : value))
      .optional()
      .nullable(),
    email: requiredString().email(invalidEmail),
    password: requiredString()
      .min(MIN_PASSWORD_LENGTH, atLeast(MIN_PASSWORD_LENGTH))
      .max(128, atMost(128))
      .refine((value) => value.trim().length > 0, {
        message: 'Password cannot be only spaces',
      }),
    confirm_password: requiredString()
      .min(MIN_PASSWORD_LENGTH, atLeast(MIN_PASSWORD_LENGTH))
      .max(128, atMost(128))
      .refine((value) => value.trim().length > 0, {
        message: 'Password cannot be only spaces',
      }),
  })
  .superRefine(({ confirm_password, password }, ctx) => {
    if (confirm_password !== password) {
      ctx.addIssue({
        code: 'custom',
        message: 'The passwords did not match',
      });
    }
  });

module.exports = {
  loginSchema,
  registerSchema,
};
