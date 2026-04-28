import type { RequestHandler } from "express";
import { findActiveUserByEmail } from "../repositories/userRepository.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { unauthorized } from "../utils/httpError.js";
import { generateToken } from "../utils/jwt.js";
import { loginRequestSchema } from "../validators/loginRequestValidator.js";

export const loginController: RequestHandler = asyncHandler(
  async (request, response) => {
    const input = loginRequestSchema.parse(request.body);
    const user = await findActiveUserByEmail(input.email);

    if (!user) {
      throw unauthorized("Invalid login credentials");
    }

    response.status(200).json({
      data: {
        token: generateToken(user),
        user,
      },
    });
  },
);
