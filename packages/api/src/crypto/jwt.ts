import jwt from 'jsonwebtoken';

/**
 * Generate a short-lived JWT token
 * @param {String} userId - The ID of the user
 * @param {String} [expireIn='5m'] - The expiration time for the token (default is 5 minutes)
 * @param {Record<string, string>} [extraClaims] - Optional extra claims to embed
 * @returns {String} - The generated JWT token
 */
export const generateShortLivedToken = (
  userId: string,
  expireIn: string = '5m',
  extraClaims?: Record<string, string>,
): string => {
  return jwt.sign({ id: userId, ...extraClaims }, process.env.JWT_SECRET!, {
    expiresIn: expireIn,
    algorithm: 'HS256',
  });
};
