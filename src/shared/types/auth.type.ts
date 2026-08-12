import { loginZod } from "../zod/auth.zod";
import { z } from "zod";

export type LoginInput = z.infer<typeof loginZod>;