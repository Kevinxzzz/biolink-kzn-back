import { loginSchema, registerSellerSchema } from "./auth.schema.js";
import { z } from "zod";

export type LoginInput = z.infer<typeof loginSchema>;