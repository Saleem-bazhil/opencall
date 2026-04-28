import { Router } from "express";
import { loginController } from "../controllers/authController.js";

export const authRouter = Router();

authRouter.post("/login", loginController);
